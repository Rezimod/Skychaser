// Planet landings QA: from the ship in space down to each world's surface,
// checking that no loading screen comes up on the way.
//
//   node scripts/qa-planets.mjs [--url http://localhost:3000] [--out dir] [--only mercury,venus] [--gl swiftshader|default]
//
// For each world: fly from orbit view, park the ship under its landing
// ceiling, press L, and watch the arrival hand over to the surface scene.
// Every 200 ms it records whether a loading screen is visible; any is a
// failure. Then it jumps through the descent with the surface's development
// hooks (top of the entry, the powered descent, the touchdown) and takes a
// screenshot at each, and one of the crew outside at the base.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const arg = (name, d) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const BASE = arg('url', 'http://localhost:3000');
const OUT = `${arg('out', './qa-planets')}/`;
const ONLY = (arg('only', '') || 'mercury,venus,jupiter,saturn,uranus,neptune').split(',').filter(Boolean);
const GL = arg('gl', 'swiftshader');
const GL_ARGS = {
  swiftshader: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  default: [],
};
mkdirSync(OUT, { recursive: true });

const failures = [];
const fail = (m) => { failures.push(m); console.log(`FAIL ${m}`); };
const say = (m) => console.log(m);

async function waitFor(page, fn, what, timeoutS = 240, a) {
  const until = Date.now() + timeoutS * 1000;
  while (Date.now() < until) {
    if (await page.evaluate(fn, a).catch(() => false)) return true;
    await page.waitForTimeout(250);
  }
  fail(`timed out waiting for ${what}`);
  return false;
}
const shot = (page, name) => page.screenshot({ path: `${OUT}${name}.png` }).catch(() => {});
/** A loading screen the player can see: the shell's, the deck's launch screen, or a surface's own. */
const loaderUp = (page) => page.evaluate(() => [...document.querySelectorAll('.cosmic-loader')].some((el) => {
  if (el.classList.contains('is-done')) return false;
  const s = getComputedStyle(el);
  if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) < 0.05) return false;
  // Inside a surface that is built but not shown yet, nothing is visible.
  const wrap = el.closest('.game-world__surface');
  return !wrap || wrap.dataset.shown === 'true';
}));

async function land(page, site) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/play?orbit`, { waitUntil: 'domcontentloaded' });
  if (!(await waitFor(page, () => window.__stellarGame?.get().state === 'playing', `[${site}] orbit to play`, 300))) return;
  await waitFor(page, () => !!document.querySelector('.flight-hud__explore'), `[${site}] the Explore key`);
  await page.$eval('.flight-hud__explore', (el) => el.click());
  await waitFor(page, () => !!window.__stellarFlight?.session.active, `[${site}] the ship`);
  await waitFor(page, () => !document.querySelector('.flight-hud__launching:not(.is-done)'), `[${site}] the launch screen to clear`, 180);
  const placed = await page.evaluate((id) => {
    const f = window.__stellarFlight;
    const b = f.world.bodies.find((x) => x.id === id);
    if (!b) return false;
    const out = b.radius * 1.6;
    f.ship.spawn({ position: { x: b.position.x + out, y: b.position.y + out * 0.2, z: b.position.z }, lookAt: b.position, yaw: 0 });
    return true;
  }, site);
  if (!placed) { fail(`[${site}] no such body in the flight world`); return; }
  if (!(await waitFor(page, (s) => {
    const k = document.querySelector('.flight-hud__land');
    return window.__stellarFlight.session.telemetry.nearId === s && k && !k.hidden && k.dataset.ready === 'true';
  }, `[${site}] the land key`, 120, site))) return;
  await shot(page, `${site}-1-land-key`);
  await page.keyboard.press('KeyL');
  const t0 = Date.now();
  let sawLoader = 0;
  let handedOver = 0;
  let shotHandover = false;
  while (Date.now() - t0 < 300_000) {
    if (await loaderUp(page)) sawLoader++;
    const g = await page.evaluate(() => window.__stellarGame.get());
    if (g.scene === site && !handedOver) handedOver = Date.now();
    if (handedOver && !shotHandover) { shotHandover = true; await shot(page, `${site}-2-handover`); }
    if (g.scene === site && g.state === 'playing') break;
    await page.waitForTimeout(200);
  }
  const playing = await page.evaluate((s) => { const g = window.__stellarGame.get(); return g.scene === s && g.state === 'playing'; }, site);
  if (!playing) { fail(`[${site}] never reached the surface scene`); return; }
  if (sawLoader) fail(`[${site}] a loading screen was visible on ${sawLoader} samples between L and the surface`);
  await page.waitForTimeout(1600);
  await shot(page, `${site}-3-orbit`);
  say(`${site}: L → surface playing in ${((Date.now() - t0) / 1000).toFixed(1)} s (handover at ${((handedOver - t0) / 1000).toFixed(1)} s), loader samples ${sawLoader}`);
  // The way down, through the development hooks.
  await page.evaluate(() => window.__stellarWorld?.skipToEntry());
  await page.waitForTimeout(6000);
  await shot(page, `${site}-4-entry`);
  const phase1 = await page.evaluate(() => ({ phase: window.__stellarWorld?.telemetry.phase, orbital: window.__stellarWorld?.telemetry.orbital?.phase ?? '' }));
  await page.waitForTimeout(8000);
  await shot(page, `${site}-5-entry-later`);
  await page.evaluate(() => window.__stellarWorld?.skipOrbit());
  await page.waitForTimeout(6000);
  await shot(page, `${site}-6-powered-descent`);
  await page.evaluate(() => window.__stellarWorld?.skipDescent());
  await waitFor(page, () => window.__stellarWorld?.telemetry.phase === 'surface' || window.__stellarWorld?.telemetry.exitReady, `[${site}] touchdown`, 120);
  await page.waitForTimeout(2500);
  await shot(page, `${site}-7-parked`);
  // Out of the ship.
  await page.evaluate(() => { const w = window.__stellarWorld; if (w) w.input.interact = true; });
  await page.waitForTimeout(5000);
  await shot(page, `${site}-8-outside`);
  const tel = await page.evaluate(() => {
    const t = window.__stellarWorld?.telemetry;
    return t ? { phase: t.phase, outsideC: Math.round(t.outsideC), view: t.view } : null;
  });
  say(`${site}: entry phase ${phase1.phase}/${phase1.orbital}; final ${JSON.stringify(tel)}`);
  const real = errors.filter((e) => !/PRIVY|privy|fetch|Failed to fetch|NetworkError/.test(e));
  if (real.length) fail(`[${site}] page errors: ${real.slice(0, 3).join(' | ')}`);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium', args: GL_ARGS[GL] ?? [] });
for (const site of ONLY) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try { await land(page, site); } catch (e) { fail(`[${site}] ${e.message}`); }
  await ctx.close();
}
await browser.close();
say(failures.length ? `\n${failures.length} failure(s)` : '\nall clear');
process.exit(failures.length ? 1 : 0);
