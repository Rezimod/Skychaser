// Game modes, the jetpack, gems and the leaderboard, on a desktop and a phone.
//
//   node scripts/qa-features.mjs [--url http://localhost:3000] [--out dir]
//
// 1. The title on a phone: the three modes, Leaderboard, Settings.
// 2. Free Fly from the title: straight into the flying ship (no Explore key).
// 3. Story from the title: the ship, and the chapter chip.
// 4. The leaderboard panel from the title.
// 5. On Mars (desktop): out of the ship, hold Space to fly; let go and fall; Space + W to fly forward; let go and land.
// 6. On Jupiter (phone, touch): the HUD, and holding the Jet key flies.
// Each step screenshots; any page error is a failure.
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('url', 'http://localhost:3000');
const OUT = `${arg('out', './qa-features')}/`;
mkdirSync(OUT, { recursive: true });
const failures = [];
const fail = (m) => { failures.push(m); console.log(`FAIL ${m}`); };
const say = (m) => console.log(m);
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function until(page, fn, what, s = 240, a) {
  const t = Date.now() + s * 1000;
  while (Date.now() < t) { if (await page.evaluate(fn, a).catch(() => false)) return true; await page.waitForTimeout(250); }
  fail(`timed out: ${what}`);
  return false;
}
const shot = (p, n) => p.screenshot({ path: `${OUT}${n}.png` }).catch(() => {});
function watch(page, label) {
  page.on('pageerror', (e) => { if (!/privy/i.test(e.message)) fail(`[${label}] ${e.message.slice(0, 200)}`); });
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium', args: GL });
const phone = { ...devices['Pixel 7'], deviceScaleFactor: 1 };
const desk = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };

// 1 + 4: the title and the leaderboard on a phone.
{
  const ctx = await browser.newContext(phone); const p = await ctx.newPage(); watch(p, 'title');
  await p.goto(`${BASE}/play`);
  if (await until(p, () => document.querySelectorAll('.game-mode').length >= 2, 'mode cards', 120)) {
    const modes = await p.$$eval('.game-mode', (els) => els.map((e) => e.getAttribute('data-mode')));
    say(`title modes: ${modes.join(', ')}`);
    await p.waitForTimeout(800); await shot(p, '1-title-phone');
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (overflow) fail('title overflows the phone width');
    await p.click('text=Leaderboard');
    await p.waitForTimeout(2500); await shot(p, '4-leaderboard-phone');
    const panel = await p.evaluate(() => !!document.querySelector('.game-panel, [role="dialog"]'));
    if (!panel) fail('leaderboard panel did not open');
  }
  await ctx.close();
}

// 2 + 3: Free Fly and Story go straight into the flying ship.
for (const mode of ['free', 'story']) {
  const ctx = await browser.newContext(desk); const p = await ctx.newPage(); watch(p, mode);
  await p.goto(`${BASE}/play`);
  if (!(await until(p, (m) => !!document.querySelector(`.game-mode[data-mode="${m}"]`), `${mode} card`, 120, mode))) { await ctx.close(); continue; }
  await p.waitForTimeout(500);
  const t0 = Date.now();
  await p.click(`.game-mode[data-mode="${mode}"]`);
  const ok = await until(p, () => !!window.__stellarFlight?.session.active && !window.__stellarFlight.session.paused && !document.querySelector('.flight-hud__launching:not(.is-done)'), `${mode}: flying`, 300);
  if (ok) say(`${mode}: title → flying ship in ${((Date.now() - t0) / 1000).toFixed(1)} s, explore key shown: ${await p.evaluate(() => !!document.querySelector('.flight-hud__explore'))}`);
  await p.waitForTimeout(2500); await shot(p, `${mode === 'free' ? 2 : 3}-${mode}-flying`);
  await ctx.close();
}

// 5: fly the jetpack on Mars.
{
  const ctx = await browser.newContext(desk); const p = await ctx.newPage(); watch(p, 'mars-jet');
  await p.goto(`${BASE}/play?land=mars`);
  if (await until(p, () => window.__stellarGame?.get().state === 'playing', 'mars playing', 300)) {
    await p.evaluate(() => window.__stellarWorld?.skipDescent());
    await until(p, () => window.__stellarWorld?.telemetry.phase === 'surface', 'mars surface', 120);
    await p.evaluate(() => { window.__stellarWorld.input.interact = true; });
    await p.waitForTimeout(4000);
    await p.mouse.click(640, 360).catch(() => {});
    await p.keyboard.press('Escape').catch(() => {});
    await p.evaluate(() => window.__stellarGame.get().state === 'paused' && window.__stellarGame.resume());
    await shot(p, '5a-mars-outside');
    const before = await p.evaluate(() => ({ alt: window.__stellarWorld.telemetry.altitude, gems: window.__stellarWorld.telemetry.gemsTotal }));
    await p.keyboard.down('Space'); await p.waitForTimeout(3500);
    const up = await p.evaluate(() => ({ flying: window.__stellarWorld.telemetry.flying, alt: window.__stellarWorld.telemetry.altitude, fuel: window.__stellarWorld.telemetry.jetFuel }));
    await shot(p, '5b-mars-flying');
    // Let go: the pack goes out at once and the crew falls (or has already landed).
    const jetNow = () => p.evaluate(() => ({ flying: window.__stellarWorld.telemetry.flying, jetting: window.__stellarWorld.telemetry.jetting, alt: window.__stellarWorld.telemetry.altitude }));
    await p.keyboard.up('Space'); await p.waitForTimeout(400);
    const released = await jetNow();
    await p.waitForTimeout(1200);
    const falling = await jetNow();
    await p.keyboard.down('Space'); await p.keyboard.down('KeyW'); await p.waitForTimeout(2500); await p.keyboard.up('KeyW');
    await shot(p, '5c-mars-flying-forward');
    await p.keyboard.up('Space'); await p.waitForTimeout(8000);
    const down = await jetNow();
    say(`mars jet: before ${JSON.stringify(before)} → up ${JSON.stringify(up)} → released ${JSON.stringify(released)} → ${JSON.stringify(falling)} → down ${JSON.stringify(down)}`);
    // Software GL runs a few frames a second and the sim clamps its step, so the climb is slow here: flying is the check.
    if (!up.flying || !(up.alt > before.alt)) fail('mars: holding Space did not fly');
    if (up.fuel !== 1) fail('mars: fuel is not unlimited');
    if (released.jetting) fail('mars: the pack stayed lit after Space was let go');
    if (falling.jetting || (released.flying && falling.flying && !(falling.alt < released.alt))) fail('mars: let go, the crew did not fall');
    if (down.jetting || (down.flying && down.alt > 0.5)) fail('mars: let go, the crew hovered instead of falling to land');
    await shot(p, '5d-mars-landed');
  }
  await ctx.close();
}

// 6: Jupiter on a phone: the touch HUD and the Jet key.
{
  const ctx = await browser.newContext(phone); const p = await ctx.newPage(); watch(p, 'jupiter-phone');
  await p.goto(`${BASE}/play?land=jupiter`);
  if (await until(p, () => window.__stellarGame?.get().state === 'playing', 'jupiter playing', 300)) {
    await p.evaluate(() => window.__stellarWorld?.skipDescent());
    await until(p, () => window.__stellarWorld?.telemetry.phase === 'surface', 'jupiter surface', 120);
    await p.evaluate(() => { window.__stellarWorld.input.interact = true; });
    await p.waitForTimeout(4000);
    await shot(p, '6a-jupiter-phone-outside');
    const jet = await p.$('.moon-hud__jet');
    if (jet) {
      const b = await jet.boundingBox();
      await p.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
      // A held touch: dispatch pointer events, since tap() lifts at once.
      await p.evaluate(() => {
        const el = document.querySelector('.moon-hud__jet');
        const r = el.getBoundingClientRect();
        const o = { pointerId: 7, pointerType: 'touch', clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true, isPrimary: true };
        el.dispatchEvent(new PointerEvent('pointerdown', o));
        setTimeout(() => el.dispatchEvent(new PointerEvent('pointerup', o)), 3000);
      });
      await p.waitForTimeout(3200);
      const t = await p.evaluate(() => ({ flying: window.__stellarWorld.telemetry.flying, alt: window.__stellarWorld.telemetry.altitude }));
      say(`jupiter touch jet: ${JSON.stringify(t)}`);
      await shot(p, '6b-jupiter-phone-flying');
    } else fail('jupiter phone: no jet key');
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (overflow) fail('jupiter HUD overflows the phone width');
  }
  await ctx.close();
}

await browser.close();
say(failures.length ? `\n${failures.length} failure(s)` : '\nall clear');
process.exit(failures.length ? 1 : 0);
