// Multiplayer QA: two browsers, two guests, one room, against the local
// Realtime stand-in. Needs a QA build pointed at it:
//
//   node scripts/fake-realtime.mjs 54321 &
//   NEXT_PUBLIC_GAME_QA=1 NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=dev npx next build
//   npx next start -p 3302 &
//   node scripts/qa-multiplayer.mjs [--url http://localhost:3302] [--out dir]
//
// Pilot A renames themselves and taps Join open space; pilot B opens A's
// invite link (no sign-in). Both launch; B is put just ahead of A, then
// behind A, and fires. Checks: the lobby, the invite, the roster, the name
// tag and the nearby list, the arrow to a pilot off the screen, the other
// pilot's bolts, and the toast and fade when B goes.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg('url', 'http://localhost:3302');
const OUT = `${arg('out', `${tmpdir()}/qa-multiplayer`)}/`;
mkdirSync(OUT, { recursive: true });

const problems = [];
const fail = (msg) => { problems.push(msg); console.log(`  ✗ ${msg}`); };
const ok = (msg) => console.log(`  ✓ ${msg}`);

/** An evaluate that gives up after a while: a page busy compiling shaders must not hang the run. */
const ask = (page, fn, a, ms = 15_000) => Promise.race([page.evaluate(fn, a), new Promise((_, no) => setTimeout(() => no(new Error('page busy')), ms))]);

async function waitFor(page, fn, what, timeoutS = 120, a) {
  const until = Date.now() + timeoutS * 1000;
  while (Date.now() < until) {
    if (await ask(page, fn, a).catch(() => false)) return true;
    await page.waitForTimeout(250);
  }
  fail(`timed out (${timeoutS}s) waiting for ${what}`);
  await page.screenshot({ path: `${OUT}timeout-${what.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.png` }).catch(() => {});
  return false;
}
const shot = async (page, name) => { await page.screenshot({ path: `${OUT}${name}.png` }); console.log(`    → ${OUT}${name}.png`); };
const click = (page, sel) => page.$eval(sel, (el) => el.click());

async function open(browser, label) {
  // The site's CSP allows wss://*.supabase.co only; the stand-in is on localhost.
  const context = await browser.newContext({ viewport: { width: 1024, height: 640 }, deviceScaleFactor: 1, bypassCSP: true });
  await context.addCookies([{ name: 'stellar_locale', value: 'en', url: BASE }]);
  await context.addInitScript(() => {
    try { localStorage.setItem('stellar_explore_help', '1'); } catch { /* none */ }
  });
  const page = await context.newPage();
  // No Privy app id on a local build: not multiplayer's.
  page.on('pageerror', (e) => { if (!/PRIVY_APP_ID/.test(e.message)) fail(`[${label}] page error: ${e.message}`); });
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) console.log(`    [${label} console] ${m.text().slice(0, 200)}`); });
  return { context, page };
}

async function launch(page, label) {
  console.log(`  [${label}] launching…`);
  await waitFor(page, () => !!document.querySelector('.room-panel__launch'), `[${label}] the Launch key`);
  // Software GL on a shared machine: the lightest preset.
  await ask(page, () => window.__stellarQuality?.pretend('performance')).catch(() => {});
  await click(page, '.room-panel__launch');
  const t0 = Date.now();
  const tick = setInterval(() => {
    ask(page, () => JSON.stringify({ g: window.__stellarGame?.get(), f: !!window.__stellarFlight?.session.active }), undefined, 5000)
      .then((st) => console.log(`    [${label}] ${Math.round((Date.now() - t0) / 1000)}s ${st}`), () => console.log(`    [${label}] ${Math.round((Date.now() - t0) / 1000)}s (page busy)`));
  }, 20_000);
  await waitFor(page, () => window.__stellarGame?.get().state === 'playing', `[${label}] the orbit scene`, 900); // software GL uploads the planets slowly
  // The orbit scene may already start in the ship; otherwise the Explore key.
  await waitFor(page, () => !!window.__stellarFlight?.session.active || !!document.querySelector('.flight-hud__explore'), `[${label}] the ship or the Explore key`, 300);
  if (!(await ask(page, () => !!window.__stellarFlight?.session.active).catch(() => false))) await click(page, '.flight-hud__explore');
  await waitFor(page, () => !!window.__stellarFlight?.session.active, `[${label}] the ship`, 300);
  await waitFor(page, () => !document.querySelector('.flight-hud__launching:not(.is-done)'), `[${label}] the launch screen to clear`, 400);
  clearInterval(tick);
  console.log(`    [${label}] flying: ${await ask(page, () => JSON.stringify({ code: window.__stellarRoom?.code, peers: window.__stellarRoom?.peers.size, viewAge: Math.round(performance.now() - (window.__stellarRoom?.view.at ?? 0)), badge: !!document.querySelector('.room-badge'), nearby: !!document.querySelector('.room-nearby'), panel: !!document.querySelector('.room-panel') })).catch((e) => e.message)}`);
}

/** Put this ship where the other one is (by its pose: body and offset), `ahead` hull-lengths along its nose. */
const placeBy = (page, other, ahead, side) => page.evaluate(([o, ahead, side]) => {
  const f = window.__stellarFlight;
  const body = f.world.bodies.find((b) => b.id === o.b);
  if (!body || !o.p || !o.q) return false;
  const [x, y, z, w] = o.q;
  // The nose (+z) and the right (+x) of the other ship, turned by its quaternion.
  const rot = (vx, vy, vz) => {
    const ix = w * vx + y * vz - z * vy;
    const iy = w * vy + z * vx - x * vz;
    const iz = w * vz + x * vy - y * vx;
    const iw = -x * vx - y * vy - z * vz;
    return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
  };
  const fwd = rot(0, 0, 1);
  const right = rot(1, 0, 0);
  const H = 0.044 * 0.006;
  const at = [0, 1, 2].map((i) => body.position.getComponent(i) + o.p[i] + fwd[i] * ahead * H + right[i] * side * H);
  const look = [0, 1, 2].map((i) => body.position.getComponent(i) + o.p[i]);
  // Real vectors: Object3D.lookAt reads a plain {x, y, z} as three numbers, and goes NaN.
  f.ship.spawn({ position: body.position.clone().set(at[0], at[1], at[2]), lookAt: body.position.clone().set(look[0], look[1], look[2]), yaw: 0 });
  f.session.input.thrust = 0;
  return true;
}, [other, ahead, side]);

const selfPose = (page) => page.evaluate(() => ({ ...window.__stellarRoom.self }));

const EXECUTABLE = arg('chrome', process.env.QA_CHROME ?? '/opt/pw-browsers/chromium');
const browser = await chromium.launch({
  headless: true, executablePath: EXECUTABLE,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  console.log('Lobby and guests');
  const A = await open(browser, 'A');
  await A.page.goto(`${BASE}/play`);
  await waitFor(A.page, () => !!document.querySelector('.game-mode[data-mode="multi"]'), '[A] the Multiplayer mode');
  await click(A.page, '.game-mode[data-mode="multi"]');
  await waitFor(A.page, () => !!document.querySelector('.room-panel__quick'), '[A] Join open space');
  const callsign = await A.page.$eval('.room-panel__flying', (el) => el.textContent);
  if (/Flying as Pilot [A-Z0-9]{4}/.test(callsign ?? '')) ok(`guest callsign with no sign-in: "${callsign}"`); else fail(`callsign reads "${callsign}"`);
  await shot(A.page, '01-lobby-guest');
  // Rename to Nino.
  await A.page.click('.room-panel__link');
  await A.page.fill('#room-callsign', 'Nino');
  await A.page.press('#room-callsign', 'Enter');
  await waitFor(A.page, () => document.querySelector('.room-panel__flying')?.textContent === 'Flying as Nino', '[A] the new name');
  await A.page.click('.room-panel__quick');
  await waitFor(A.page, () => !!document.querySelector('.room-panel__bigcode'), '[A] a room');
  const code = await A.page.$eval('.room-panel__bigcode', (el) => el.textContent);
  ok(`Join open space opened room ${code}`);
  await shot(A.page, '02-lobby-in-room');

  const B = await open(browser, 'B');
  await B.page.goto(`${BASE}/play?room=${code}`);
  await waitFor(B.page, () => !!document.querySelector('.room-panel__bigcode'), '[B] in the room from the invite link');
  const bCode = await B.page.$eval('.room-panel__bigcode', (el) => el.textContent);
  if (bCode === code) ok('the invite link joined B straight into the room, as a guest'); else fail(`B is in ${bCode}, not ${code}`);
  await waitFor(B.page, () => document.querySelectorAll('.room-panel__name').length === 2, '[B] two in the roster');
  const roster = await B.page.$$eval('.room-panel__name', (els) => els.map((e) => e.textContent));
  ok(`B's roster: ${roster.join(', ')}`);
  await shot(B.page, '03-invite-joined');

  console.log('Flight');
  await launch(A.page, 'A');
  await launch(B.page, 'B');
  await A.page.waitForTimeout(1500);
  // B just ahead of A, a little to the side: in A's view.
  const aPose = await selfPose(A.page);
  if (!(await placeBy(B.page, aPose, 14, 3))) fail('could not place B by A');
  const sees = await waitFor(A.page, () => (window.__stellarRoom?.view.pilots ?? []).some((p) => p.onScreen && p.km < 5000), '[A] B on the screen', 30);
  if (sees) ok(`A sees B: ${JSON.stringify(await A.page.evaluate(() => window.__stellarRoom.view.pilots.map((p) => ({ name: p.name, km: Math.round(p.km), on: p.onScreen }))))}`);
  await waitFor(A.page, () => !!document.querySelector('.room-nearby__row'), '[A] the nearby list', 10);
  const nearby = await A.page.$$eval('.room-nearby__row', (els) => els.map((e) => e.textContent));
  ok(`A's nearby list: ${nearby.join(' | ')}`);
  await A.page.waitForTimeout(800);
  await shot(A.page, '04-A-sees-B');
  const bSees = await waitFor(B.page, () => (window.__stellarRoom?.view.pilots ?? []).some((p) => p.name === 'Nino'), '[B] Nino in the view', 20);
  if (bSees) ok('B sees Nino');
  await shot(B.page, '05-B-sees-A');

  // B fires: A gets the bolts.
  await B.page.evaluate(() => { const f = window.__stellarFlight; f.session.combat = true; f.session.input.fire = true; });
  const got = await waitFor(A.page, () => (window.__stellarRoom?.shotsIn.length ?? 0) > 0, '[A] B\'s bolts', 10);
  await A.page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  await shot(A.page, '06-A-sees-B-fire');
  await B.page.evaluate(() => { window.__stellarFlight.session.input.fire = false; });
  if (got) ok('A received B\'s cannon fire');

  // B behind A: an arrow at A's screen edge.
  const aPose2 = await selfPose(A.page);
  await placeBy(B.page, aPose2, -25, 0);
  const arrow = await waitFor(A.page, () => [...document.querySelectorAll('.room-radar__arrow')].some((el) => el.style.display !== 'none'), '[A] an arrow to B', 20);
  if (arrow) {
    const where = await A.page.$eval('.room-radar__arrow:not([style*="display: none"])', (el) => `${el.style.transform} "${el.textContent}"`);
    ok(`arrow to B off the screen: ${where}`);
  }
  await shot(A.page, '07-A-arrow-to-B');

  console.log('Leaving');
  await B.context.close();
  const left = await waitFor(A.page, () => [...document.querySelectorAll('.room-badge__toast')].some((el) => /left/.test(el.textContent ?? '')), '[A] the left toast', 30);
  if (left) ok(`toast: ${await A.page.$eval('.room-badge__toast', (el) => el.textContent)}`);
  await shot(A.page, '08-A-B-left');
  const gone = await waitFor(A.page, () => (window.__stellarRoom?.view.pilots ?? []).length === 0, '[A] B gone from the view', 20);
  if (gone) ok('B is gone from A\'s sky');
  await A.context.close();
} finally {
  await browser.close();
}

console.log(problems.length ? `\n${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}` : '\nAll multiplayer checks passed.');
process.exit(problems.length ? 1 : 0);
