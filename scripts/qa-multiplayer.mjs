// Multiplayer QA: two browsers, two guests, one room, against the local
// Realtime stand-in. Needs a QA build pointed at it:
//
//   node scripts/fake-realtime.mjs 54321 &
//   NEXT_PUBLIC_GAME_QA=1 NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=dev npx next build
//   npx next start -p 3302 &
//   node scripts/qa-multiplayer.mjs [--url http://localhost:3302] [--out dir]
//
// Pilot A renames themselves and taps Join open space; pilot B opens A's
// invite link in a second browser (no sign-in) and lands in the room. Then A
// flies, and a bot pilot (Gio, over the same protocol) flies beside A,
// fires, drops behind A, goes quiet and leaves. Checks: the lobby, the
// invite, the roster, the name tag and the nearby list, the other pilot's
// bolts, the arrow to a pilot off the screen, the fade, and the toast.

import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg('url', 'http://localhost:3302');
const BASE_RT = arg('realtime', 'ws://localhost:54321');
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
  // --css file: extra rules over the build's, to check a style fix without rebuilding.
  const css = arg('css', '');
  if (css) {
    const text = readFileSync(css, 'utf8');
    await context.addInitScript((t) => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = t; document.head.appendChild(s); }); }, text);
  }
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

/** A pose `ahead` hull-lengths along another's nose and `side` to its right, from the same body. */
function offsetPose(o, ahead, side) {
  const [x, y, z, w] = o.q;
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
  return { b: o.b, q: o.q, fwd, p: o.p.map((v, i) => v + fwd[i] * ahead * H + right[i] * side * H) };
}

/** A pilot without a browser: joins the room over the Realtime protocol, tracks
 *  presence, sends poses and bolts like the game does. */
async function bot(code, name) {
  const { WebSocket } = await import('ws');
  const ws = new WebSocket(`${BASE_RT}/realtime/v1/websocket?apikey=dev&vsn=1.0.0`);
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const topic = `realtime:explore-room-${code}`;
  const id = `bot-${name}`;
  let ref = 0;
  const send = (event, payload, t = topic) => ws.send(JSON.stringify({ topic: t, event, payload, ref: String(++ref), join_ref: '1' }));
  send('phx_join', { config: { broadcast: { self: false }, presence: { key: id, enabled: true } } });
  send('presence', { type: 'presence', event: 'track', payload: { name, scene: 'flight', world: '', joinedAt: Date.now(), epoch: 0, pub: true } });
  let pose = null;
  let firing = false;
  let muted = false;
  let n = 0;
  const t0 = Date.now();
  const beat = setInterval(() => send('heartbeat', {}, 'phoenix'), 20_000);
  const tick = setInterval(() => {
    if (!pose || muted) return;
    const t = Date.now() - t0;
    send('broadcast', { type: 'broadcast', event: 'pose', payload: { id, n: ++n, s: 'flight', b: pose.b, p: pose.p, q: pose.q, k: 'xfoil', t } });
    if (firing) send('broadcast', { type: 'broadcast', event: 'shot', payload: { id, b: pose.b, p: pose.p, v: pose.fwd.map((f) => f * 0.144), t } });
  }, 150);
  return {
    ahead: 0, side: 0,
    setPose(p) { pose = p; },
    setFiring(f) { firing = f; },
    mute() { muted = true; },
    close() { clearInterval(beat); clearInterval(tick); ws.close(); },
  };
}

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

  // The lobby side of B is done. In flight B goes on as a bot speaking the
  // same protocol: two software-GL flights at once are more than a shared
  // machine can draw, and A's view of B is what is being checked.
  await B.context.close();

  console.log('Flight');
  await launch(A.page, 'A');
  const gio = await bot(code, 'Gio');
  const follow = async (ahead, side) => {
    const a = await selfPose(A.page).catch(() => null);
    if (a?.b && a.p && a.q) gio.setPose(offsetPose(a, ahead, side));
  };
  await follow(14, 3);
  const keep = setInterval(() => { void follow(gio.ahead, gio.side); }, 1000);
  gio.ahead = 14; gio.side = 3;
  const sees = await waitFor(A.page, () => (window.__stellarRoom?.view.pilots ?? []).some((p) => p.onScreen && p.name === 'Gio'), '[A] Gio on the screen', 60);
  if (sees) ok(`A sees Gio: ${JSON.stringify(await A.page.evaluate(() => window.__stellarRoom.view.pilots.map((p) => ({ name: p.name, km: Math.round(p.km), on: p.onScreen }))))}`);
  await waitFor(A.page, () => !!document.querySelector('.room-nearby__row'), '[A] the nearby list', 20);
  const nearby = await A.page.$$eval('.room-nearby__row', (els) => els.map((e) => e.textContent)).catch(() => []);
  if (nearby.length) ok(`A's nearby list: ${nearby.join(' | ')}`);
  await A.page.waitForTimeout(1500);
  await shot(A.page, '04-A-sees-Gio');

  // Gio fires along A's heading: A gets the bolts and draws them.
  gio.setFiring(true);
  const got = await waitFor(A.page, () => (window.__stellarRoom?.shotsIn.length ?? 0) > 0, '[A] Gio\'s bolts', 20);
  if (got) ok('A received Gio\'s cannon fire');
  await A.page.waitForTimeout(700);
  await shot(A.page, '05-A-sees-Gio-fire');
  gio.setFiring(false);

  // Gio behind A: an arrow at A's screen edge.
  gio.ahead = -30; gio.side = 4;
  await follow(gio.ahead, gio.side);
  const arrow = await waitFor(A.page, () => [...document.querySelectorAll('.room-radar__arrow')].some((el) => el.style.display !== 'none'), '[A] an arrow to Gio', 30);
  if (arrow) {
    const where = await A.page.$eval('.room-radar__arrow:not([style*="display: none"])', (el) => `${el.style.transform} "${el.textContent}"`);
    ok(`arrow to Gio off the screen: ${where}`);
  }
  await A.page.waitForTimeout(800);
  await shot(A.page, '06-A-arrow-to-Gio');

  // The room panel from the badge, over the flight.
  await click(A.page, '.room-badge__chip').catch(() => fail('no room badge to open'));
  if (await waitFor(A.page, () => !!document.querySelector('.room-panel .room-panel__bigcode'), '[A] the in-game room panel', 20)) ok('the in-game room panel opens from the badge');
  await A.page.waitForTimeout(800);
  await shot(A.page, '06b-A-room-panel');
  await click(A.page, '.room-panel__icon').catch(() => {});

  // Gio's packets stop (the socket stays): A fades him out rather than freezing him.
  clearInterval(keep);
  gio.mute();
  const faded = await waitFor(A.page, () => (window.__stellarRoom?.view.pilots ?? []).length === 0, '[A] a silent Gio faded out', 30);
  if (faded) ok('a pilot whose packets stopped faded out of A\'s sky');

  console.log('Leaving');
  gio.close();
  const left = await waitFor(A.page, () => [...document.querySelectorAll('.room-badge__toast')].some((el) => /Gio left/.test(el.textContent ?? '')), '[A] the left toast', 30);
  if (left) ok(`toast: ${await A.page.$eval('.room-badge__toast', (el) => el.textContent)}`);
  await shot(A.page, '07-A-Gio-left');
  await A.context.close();
} finally {
  await browser.close();
}

console.log(problems.length ? `\n${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}` : '\nAll multiplayer checks passed.');
process.exit(problems.length ? 1 : 0);
