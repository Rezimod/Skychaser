// Flight and shell QA: node scripts/qa-flight.mjs [--url http://localhost:3000] [--out dir] [--only desktop,phones,leak,ctx] [--gl swiftshader|metal|default] [--locale en|ka] [--rounds 5]
//
// Everything above the planets' surfaces, driven through the dev hooks, on a
// desktop and on emulated phones — and failing on anything that would make a
// player stop playing:
//   desktop  title → menus → Enter → the orrery → Explore → flying (inputs,
//            the three regimes) → a star route out and back → a target and
//            the docking computer → down to the Moon, Mars and Earth through
//            the land key (orbit insertion → the surface) and back up each
//            time (the relaunch over the world just left) → pause, every
//            quality preset switched live, FOV and sensitivity, the controls
//            and missions sheets → the language turned to Georgian and back
//            mid-game → exit to the site → back in (the checkpoint).
//   phones   iPhone 14 and Pixel 7, portrait and landscape, touch: the same
//            screens, audited for overlap, clipping, sideways scroll, tap
//            targets under 44 px and controls under the notch or home bar
//            (the safe areas are emulated through CDP), plus the land key
//            tapped with a finger.
//   leak     orbit ↔ surface round trips (`--rounds`, default 5), with the JS
//            heap and the live WebGL buffers, textures and programs of every
//            context still alive after each one.
//   ctx      WEBGL_lose_context on the orrery and in flight: the scene has to
//            come back, not leave a black glass.
//
// Software GL (`--gl swiftshader`, the default here) runs a few frames a
// second: every step waits on the game's own state, never on wall time.
// Screens go to --out; problems are printed at the end and fail the run.
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadavg, tmpdir } from 'node:os';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const BASE = arg('url', 'http://localhost:3000');
const ONLY = arg('only', 'desktop,phones,leak,ctx').split(',');
const OUT = `${arg('out', `${tmpdir()}/qa-flight`)}/`;
const GL = arg('gl', 'swiftshader');
const ROUNDS = Number(arg('rounds', '5'));
const LOCALE = arg('locale', 'en');
mkdirSync(OUT, { recursive: true });

const GL_ARGS = {
  swiftshader: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  metal: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  default: ['--ignore-gpu-blocklist'],
}[GL];
const EXECUTABLE = arg('chrome', process.env.QA_CHROME ?? '/opt/pw-browsers/chromium');

/** Not Explore's: Privy and WalletConnect without a real app id or network,
 *  the placeholder app id's 503s and 403s, Supabase realtime with no
 *  project, a request aborted on the way out of a scene, a context this run
 *  took away itself. */
const NOISE = /privy|walletconnect|web3modal|reown|status of 40[13]|status of 50[0-9]|Access is denied for this document|datadoghq|ERR_ABORTED|ERR_BLOCKED_BY_ORB|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION|ERR_TUNNEL|ERR_PROXY|Failed to fetch|supabase|Failed to load resource|Download the React DevTools|\[Fast Refresh\]|\[HMR\]/i;
const problems = [];
const noted = [];
const glWarnings = new Map();
const say = (s) => console.log(`· ${s}`);
const fail = (s) => { problems.push(s); console.log(`  ✗ ${s}`); };

// ── Page plumbing ──────────────────────────────────────────────────────

/** Installed before any page script: per-context live WebGL resources, so a
 *  context the game gave back stops counting, and every draw. */
function instrument() {
  const live = new Set();
  const s = { calls: 0 };
  window.__qa = s;
  const count = (ctx, key, d) => {
    const c = ctx.__qa ?? (ctx.__qa = { buffers: 0, textures: 0, programs: 0, framebuffers: 0 });
    c[key] += d;
    live.add(ctx);
  };
  for (const Ctx of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!Ctx) continue;
    const p = Ctx.prototype;
    const wrap = (name, fn) => { const orig = p[name]; if (orig) p[name] = function (...a) { fn(this, a); return orig.apply(this, a); }; };
    wrap('createBuffer', (c) => count(c, 'buffers', 1));
    wrap('deleteBuffer', (c, a) => { if (a[0]) count(c, 'buffers', -1); });
    wrap('createTexture', (c) => count(c, 'textures', 1));
    wrap('deleteTexture', (c, a) => { if (a[0]) count(c, 'textures', -1); });
    wrap('createProgram', (c) => count(c, 'programs', 1));
    wrap('deleteProgram', (c, a) => { if (a[0]) count(c, 'programs', -1); });
    wrap('createFramebuffer', (c) => count(c, 'framebuffers', 1));
    wrap('deleteFramebuffer', (c, a) => { if (a[0]) count(c, 'framebuffers', -1); });
    wrap('drawElements', () => { s.calls++; });
    wrap('drawArrays', () => { s.calls++; });
    wrap('drawElementsInstanced', () => { s.calls++; });
    wrap('drawArraysInstanced', () => { s.calls++; });
  }
  s.gpu = () => {
    const out = { contexts: 0, lost: 0, buffers: 0, textures: 0, programs: 0, framebuffers: 0 };
    for (const ctx of live) {
      if (ctx.isContextLost()) { out.lost++; continue; }
      out.contexts++;
      for (const k of ['buffers', 'textures', 'programs', 'framebuffers']) out[k] += ctx.__qa[k];
    }
    return out;
  };
  // The longest frame since the last read.
  s.maxFrame = 0;
  let last = performance.now();
  const tick = (now) => { s.maxFrame = Math.max(s.maxFrame, now - last); last = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

function watch(page, tag) {
  page.on('pageerror', (e) => fail(`[${tag}] pageerror: ${e.message}`));
  // A renderer the OS killed (memory) or that crashed is a dead game: stop
  // waiting on it rather than time out one step at a time.
  page.on('crash', () => { fail(`[${tag}] the page crashed`); page.close().catch(() => {}); });
  page.on('console', (m) => {
    const text = m.text();
    if (/GL_INVALID|WebGL: |Mismatch between texture format|THREE\.WebGLRenderer|THREE\.WebGLProgram|Shader Error/i.test(text)) {
      const key = text.replace(/\d+/g, '#').slice(0, 200);
      glWarnings.set(key, (glWarnings.get(key) ?? 0) + 1);
      return;
    }
    if (m.type() !== 'error' && !/Warning: |React does not recognize|Each child in a list|unmounted component|Cannot update a component/.test(text)) return;
    if (NOISE.test(text)) { noted.push(text.slice(0, 160)); return; }
    fail(`[${tag}] console: ${text.slice(0, 400)}`);
  });
  return page;
}

async function waitFor(page, fn, what, timeoutS = 240, arg) {
  const until = Date.now() + timeoutS * 1000;
  while (Date.now() < until) {
    if (await page.evaluate(fn, arg).catch(() => false)) return true;
    await page.waitForTimeout(400);
  }
  fail(`timed out (${timeoutS}s) waiting for ${what}`);
  return false;
}
const snap = (page) => page.evaluate(() => window.__stellarGame?.get() ?? null);
const waitState = (page, state, scene, timeoutS = 300) => waitFor(page, ([s, sc]) => {
  const g = window.__stellarGame?.get();
  return !!g && g.state === s && (!sc || g.scene === sc);
}, `game ${state}${scene ? ` in ${scene}` : ''}`, timeoutS, [state, scene]);
const shot = (page, name) => page.screenshot({ path: `${OUT}${name}.png` }).catch(() => {});
/** A click that does not wait on the page: the scene a key opens is built on
 *  the main thread right after it, and software GL can hold that thread for
 *  longer than any click timeout. */
const hit = (page, sel) => page.$eval(sel, (el) => el.click());
/** A finger on it: real touch events, but without waiting for the frame after. */
const touchKey = (page, sel) => page.tap(sel, { noWaitAfter: true, timeout: 120_000 });
const heapMb = (page) => page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576));
const gpu = (page) => page.evaluate(() => window.__qa.gpu());
const flying = (page) => page.evaluate(() => !!window.__stellarFlight?.session.active && !window.__stellarFlight.session.paused);

/** Clear the saves once per context, not on every reload: a reload has to find what was saved. */
const FRESH = () => {
  if (sessionStorage.getItem('qa-cleared')) return;
  sessionStorage.setItem('qa-cleared', '1');
  for (const k of Object.keys(localStorage)) if (k.startsWith('stellar_')) localStorage.removeItem(k);
  // The control card would sit over the first screens of every run.
  localStorage.setItem('stellar_explore_help', '1');
};
/** The dev server's own issue badge is not the game's: keep it out of the shots. */
const NO_DEV_BADGE = () => {
  const hide = () => { const s = document.createElement('style'); s.textContent = 'nextjs-portal { display: none !important; }'; document.head.appendChild(s); };
  if (document.head) hide(); else document.addEventListener('DOMContentLoaded', hide);
};

async function openContext(browser, opts = {}) {
  const { device, locale = LOCALE, safeArea } = opts;
  const context = await browser.newContext(device ? { ...device } : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await context.addCookies([{ name: 'stellar_locale', value: locale, url: BASE }]);
  await context.addInitScript(instrument);
  await context.addInitScript(FRESH);
  await context.addInitScript(NO_DEV_BADGE);
  const page = await context.newPage();
  if (safeArea) {
    // The notch and the home bar: Chromium can pretend to have them.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: safeArea }).catch((e) => noted.push(`safe-area emulation unavailable: ${e.message}`));
  }
  return { context, page };
}

// ── The layout audit ───────────────────────────────────────────────────

/** Every visible control and line of text on the glass: off the screen,
 *  clipped, overlapping another control, too small to hit, inside a safe
 *  area, or too faint to read. Runs in the page. */
function AUDIT({ touch, insets }) {
  const out = [];
  const W = innerWidth;
  const H = innerHeight;
  const vis = (el) => {
    if (el.closest('[hidden]') || el.closest('[aria-hidden="true"]') && !el.matches('button')) return false;
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const name = (el) => `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(' ').filter(Boolean).slice(0, 2).join('.')}${el.textContent?.trim() ? ` "${el.textContent.trim().slice(0, 24)}"` : ''}`;
  if (document.documentElement.scrollWidth > W + 1) out.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${W})`);
  const roots = '.game-shell';
  const controls = [...document.querySelectorAll(`${roots} button, ${roots} select, ${roots} input, ${roots} a[href]`)].filter(vis)
    // The editor's ghosts and the look pad sit over controls by design.
    .filter((el) => !el.closest('.flight-hud__editor, .flight-hud__lookpad'));
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    if (r.right < 1 || r.bottom < 1 || r.left > W - 1 || r.top > H - 1) continue;
    if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) out.push(`off the screen: ${name(el)} [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}]`);
    if (touch && !el.matches('input[type="range"], input[type="checkbox"]') && (r.width < 44 || r.height < 44)) {
      // A checkbox's own box is small; its row is the target, measured instead.
      out.push(`tap target ${Math.round(r.width)}×${Math.round(r.height)}: ${name(el)}`);
    }
    if (insets) {
      if (r.top < insets.top - 1 || r.bottom > H - insets.bottom + 1 || r.left < insets.left - 1 || r.right > W - insets.right + 1) out.push(`in the safe area: ${name(el)} [${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)}]`);
    }
  }
  // Two controls on top of each other: the one underneath cannot be hit.
  for (let i = 0; i < controls.length; i++) {
    for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i]; const b = controls[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect(); const rb = b.getBoundingClientRect();
      const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ix > 4 && iy > 4) out.push(`overlap ${Math.round(ix)}×${Math.round(iy)}: ${name(a)} ⟷ ${name(b)}`);
    }
  }
  // Text: clipped by its box, or too faint against the dark glass.
  const lum = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const parse = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);
  for (const el of document.querySelectorAll(`${roots} *`)) {
    if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (!vis(el) || el.closest('.flight-hud__editor, svg')) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.right < 0 || r.left > W || r.bottom < 0 || r.top > H) continue;
    const clipsX = ['hidden', 'clip'].includes(cs.overflowX) || cs.textOverflow === 'ellipsis';
    if (clipsX && el.scrollWidth > el.clientWidth + 2) out.push(`text clipped (${el.scrollWidth}>${el.clientWidth}): ${name(el)}`);
    if (r.right > W + 1 || r.left < -1) out.push(`text off the screen: ${name(el)}`);
    const [cr, cg, cb, ca = 1] = parse(cs.color);
    // Composited over the darkest the glass gets; a faint line over a bright
    // planet is the scene's problem, a faint line over black is the deck's.
    const bg = [5, 8, 18];
    const mix = (c, b) => c * ca * Number(cs.opacity) + b * (1 - ca * Number(cs.opacity));
    const L1 = 0.2126 * lum(mix(cr, bg[0])) + 0.7152 * lum(mix(cg, bg[1])) + 0.0722 * lum(mix(cb, bg[2]));
    const L0 = 0.2126 * lum(bg[0]) + 0.7152 * lum(bg[1]) + 0.0722 * lum(bg[2]);
    const ratio = (L1 + 0.05) / (L0 + 0.05);
    const size = parseFloat(cs.fontSize);
    if (ratio < (size >= 18 ? 3 : 4.5)) out.push(`contrast ${ratio.toFixed(1)}:1 at ${size}px: ${name(el)}`);
    if (size < 10) out.push(`text ${size}px: ${name(el)}`);
  }
  return [...new Set(out)];
}

async function audit(page, label, opts = {}) {
  const found = await page.evaluate(AUDIT, { touch: !!opts.touch, insets: opts.insets ?? null }).catch((e) => [`audit failed: ${e.message}`]);
  const ignore = opts.ignore ?? null;
  const real = ignore ? found.filter((f) => !ignore.test(f)) : found;
  if (real.length) for (const f of real) fail(`[${label}] ${f}`);
  else say(`${label}: layout clean`);
  return real;
}

/** The loader is gone once the scene plays; a loader that is still up is stuck. */
async function noStuckLoader(page, label) {
  const up = await page.evaluate(() => [...document.querySelectorAll('.cosmic-loader')].filter((el) => !el.classList.contains('is-done') && getComputedStyle(el).visibility !== 'hidden').map((el) => el.className));
  if (up.length) fail(`[${label}] a loader is still up while playing: ${up.join(', ')}`);
}

// ── Flight helpers ─────────────────────────────────────────────────────

const spawnNear = (page, id, radii = 2.2) => page.evaluate(([id, radii]) => {
  const f = window.__stellarFlight;
  const b = f.world.bodies.find((x) => x.id === id);
  if (!b) return false;
  const out = b.radius * radii;
  f.ship.spawn({ position: { x: b.position.x + out, y: b.position.y + out * 0.2, z: b.position.z }, lookAt: b.position, yaw: 0 });
  return true;
}, [id, radii]);
const nearest = (page) => page.evaluate(() => {
  const f = window.__stellarFlight;
  const p = f.ship.group.position;
  return f.world.bodies.filter((b) => !b.destroyed).map((b) => ({ id: b.id, d: +(b.position.distanceTo(p) / b.radius).toFixed(2) })).sort((x, y) => x.d - y.d)[0];
});
const tel = (page) => page.evaluate(() => {
  const t = window.__stellarFlight?.session.telemetry;
  return t ? { frame: t.frame, mode: t.mode, speedKmS: +t.speedKmS.toFixed(2), jump: t.jumpPhase, system: t.systemName, near: t.nearId, alt: Math.round(t.nearAltKm), nav: t.navId, dock: t.canDock, docking: t.docking, docked: t.docked, approach: t.approachPhase, alert: t.alert } : null;
});

async function startFlight(page, label) {
  await waitFor(page, () => !!document.querySelector('.flight-hud__explore'), `[${label}] the Explore key`);
  await hit(page, '.flight-hud__explore');
  await waitFor(page, () => !!window.__stellarFlight?.session.active, `[${label}] the ship`);
  // The launch screen comes down after a few flown frames.
  await waitFor(page, () => !document.querySelector('.flight-hud__launching:not(.is-done)'), `[${label}] the launch screen to clear`, 180);
}

/** Down to a world through the land key (or L), and wait for its surface to play. */
async function landOn(page, site, label, { tap = false } = {}) {
  const host = site === 'moon' ? 'moon' : site;
  if (site === 'proximaB') {
    const there = await page.evaluate(() => window.__stellarFlight.session.telemetry.systemName);
    if (there !== 'alphaCentauri') { fail(`[${label}] Proxima b needs the ship at Alpha Centauri, it is at ${there}`); return false; }
  }
  if (!(await spawnNear(page, site, 2.2))) { fail(`[${label}] no ${site} in this system`); return false; }
  const ready = await waitFor(page, ([s]) => {
    const k = document.querySelector('.flight-hud__land');
    const t = window.__stellarFlight.session.telemetry;
    return t.nearId === s && k && !k.hidden && k.dataset.ready === 'true';
  }, `[${label}] the land key over ${site}`, 120, [site]);
  if (!ready) return false;
  await shot(page, `${label}-land-key-${site}`);
  if (tap) await touchKey(page, '.flight-hud__land');
  else await page.keyboard.press('KeyL');
  const legs = [];
  const until = Date.now() + 240_000;
  let left = false;
  while (Date.now() < until) {
    const s = await page.evaluate(() => ({ g: window.__stellarGame.get(), ph: window.__stellarFlight?.session.telemetry.approachPhase ?? '' }));
    if (s.ph && !legs.includes(s.ph)) { legs.push(s.ph); await shot(page, `${label}-${site}-leg-${s.ph}`); }
    if (s.g.scene === host) { left = true; break; }
    await page.waitForTimeout(300);
  }
  if (!left) { fail(`[${label}] the arrival at ${site} never handed over (legs ${legs.join(',')})`); return false; }
  await shot(page, `${label}-${site}-loader`);
  const loaderVariant = await page.evaluate(() => document.querySelector('.game-shell__loader')?.dataset.variant ?? '');
  const ok = await waitState(page, 'playing', host, 420);
  say(`${label}: ${site} — legs ${legs.join(' → ') || '(skipped)'}, loader ${loaderVariant || 'gone'}, ${ok ? 'surface playing' : 'NOT PLAYING'}`);
  if (ok) await shot(page, `${label}-${site}-surface`);
  return ok;
}

/** Back up to orbit and into the ship over the world just left. */
async function relaunch(page, site, label) {
  await page.evaluate(() => window.__stellarGame.travel('orbit'));
  await page.waitForTimeout(500);
  const variant = await page.evaluate(() => document.querySelector('.game-shell__loader')?.dataset.variant ?? '');
  await shot(page, `${label}-${site}-ascent`);
  const ok = await waitState(page, 'playing', 'orbit', 300) && await waitFor(page, () => !!window.__stellarFlight?.session.active && !window.__stellarFlight.session.paused, `[${label}] the ship flying again`, 180);
  if (!ok) return false;
  await waitFor(page, () => !document.querySelector('.flight-hud__launching:not(.is-done)'), `[${label}] the relaunch screen to clear`, 120);
  const n = await nearest(page);
  const want = site === 'moon' ? 'moon' : site === 'proximaB' ? 'proxima-b' : site;
  if (n.id !== want && !(site === 'proximaB' && /proxima/i.test(n.id))) fail(`[${label}] came back up over ${n.id} (${n.d} radii), not ${site}`);
  if (variant !== 'ascent') fail(`[${label}] the climb from ${site} showed the "${variant}" loader, not the ascent`);
  say(`${label}: back up from ${site}, over ${n.id} at ${n.d} radii (${variant} loader)`);
  await noStuckLoader(page, `${label} relaunch`);
  await shot(page, `${label}-${site}-relaunched`);
  return true;
}

async function jumpTo(page, dest, label) {
  // Clear of every mass lock: far above the current system's star.
  await page.evaluate(() => {
    const f = window.__stellarFlight;
    const star = f.world.bodies.filter((b) => b.kind === 'star').sort((a, b) => a.position.distanceTo(f.ship.group.position) - b.position.distanceTo(f.ship.group.position))[0];
    f.ship.spawn({ position: { x: star.position.x, y: star.position.y + star.radius * 900, z: star.position.z }, lookAt: star.position, yaw: 0 });
  });
  await waitFor(page, () => window.__stellarFlight.session.telemetry.driveReady, `[${label}] the drive to be clear`, 60);
  const from = await page.evaluate(() => window.__stellarFlight.session.telemetry.systemName);
  await page.evaluate((d) => { const f = window.__stellarFlight; f.session.destination = d; f.session.input.modeRequest = 'jump'; }, dest);
  const legs = [];
  const until = Date.now() + 300_000;
  let t;
  while (Date.now() < until) {
    t = await tel(page);
    if (t.jump !== 'none' && !legs.includes(t.jump)) { legs.push(t.jump); await shot(page, `${label}-jump-${dest}-${t.jump}`); }
    if (legs.length && t.jump === 'none') break;
    await page.waitForTimeout(400);
  }
  say(`${label}: jump ${from} → ${t.system} (${legs.join(' → ') || 'never engaged'})`);
  if (t.system !== dest) fail(`[${label}] the jump to ${dest} ended in ${t.system} (${legs.join(',')}, alert ${t.alert})`);
  await page.waitForTimeout(1500);
  await shot(page, `${label}-jump-${dest}-arrived`);
}

async function openPause(page) {
  await page.keyboard.press('Escape');
  return waitState(page, 'paused', null, 30);
}

// ── Scenarios ──────────────────────────────────────────────────────────

async function desktop(browser) {
  const label = `desk-${LOCALE}`;
  const { context, page } = await openContext(browser);
  watch(page, label);
  try {
    await page.goto(`${BASE}/play`, { waitUntil: 'commit', timeout: 300_000 });
    if (!(await waitState(page, 'title'))) return;
    await page.waitForTimeout(1200);
    await shot(page, `${label}-01-title`);
    await audit(page, `${label} title`);
    // The title's own sheets.
    for (const [sheet, n] of [['missions', '02'], ['settings', '03']]) {
      await page.evaluate((s) => window.__stellarGame.openOverlay(s), sheet);
      await page.waitForTimeout(500);
      await shot(page, `${label}-${n}-title-${sheet}`);
      await audit(page, `${label} title ${sheet}`);
      await page.keyboard.press('Escape');
      await waitFor(page, () => window.__stellarGame.get().overlay === 'none', `${sheet} to close on Esc`, 10);
    }
    // Enter.
    await hit(page, '.game-menu__item--primary');
    await page.waitForTimeout(800);
    await shot(page, `${label}-04-loading`);
    if (!(await waitState(page, 'playing', 'orbit', 420))) return;
    await page.waitForTimeout(1500);
    await shot(page, `${label}-05-orrery`);
    await noStuckLoader(page, `${label} orrery`);
    await audit(page, `${label} orrery`);

    // Flight.
    await startFlight(page, label);
    await page.waitForTimeout(1000);
    await shot(page, `${label}-06-flight`);
    await audit(page, `${label} flight`);
    const t0 = await tel(page);
    say(`${label}: flying near ${(await nearest(page)).id}, frame ${t0.frame}`);
    await page.evaluate(() => { const i = window.__stellarFlight.session.input; i.thrust = 1; i.yaw = 0.3; i.mouseDX = 40; });
    await page.waitForTimeout(4000);
    await page.evaluate(() => { const i = window.__stellarFlight.session.input; i.thrust = 0; i.yaw = 0; });
    const t1 = await tel(page);
    if (t1.frame <= t0.frame) fail(`[${label}] the ship flew no frames under thrust`);
    say(`${label}: thrust → ${t1.speedKmS} km/s over ${t1.frame - t0.frame} frames`);
    for (const mode of ['fast', 'ultra', 'cruise']) {
      await page.keyboard.press(mode === 'fast' ? 'Digit2' : mode === 'ultra' ? 'Digit3' : 'Digit1');
      const ok = await waitFor(page, (m) => window.__stellarFlight.session.telemetry.mode === m, `[${label}] regime ${mode}`, 30, mode);
      if (ok && mode === 'ultra') {
        await page.evaluate(() => { window.__stellarFlight.session.input.thrust = 1; });
        await page.waitForTimeout(3000);
        await shot(page, `${label}-07-ultra`);
        await page.evaluate(() => { window.__stellarFlight.session.input.thrust = 0; });
      }
    }
    say(`${label}: regimes cruise → fast → ultra → cruise`);

    // A target, and the docking computer at the station.
    await page.evaluate(() => { window.__stellarFlight.session.input.targetRequest = 'iss'; });
    await waitFor(page, () => window.__stellarFlight.session.telemetry.navId === 'iss', `[${label}] the ISS locked`, 30);
    await spawnNear(page, 'iss', 6);
    const canDock = await waitFor(page, () => window.__stellarFlight.session.telemetry.canDock, `[${label}] the dock key at the ISS`, 60);
    if (canDock) {
      await shot(page, `${label}-08-dock-key`);
      await page.keyboard.press('KeyK');
      const docked = await waitFor(page, () => window.__stellarFlight.session.telemetry.docked, `[${label}] docked at the ISS`, 240);
      if (docked) { await shot(page, `${label}-09-docked`); await audit(page, `${label} docked`); }
      await page.keyboard.press('KeyK');
      await waitFor(page, () => !window.__stellarFlight.session.telemetry.docked, `[${label}] undocked`, 120);
    }
    say(`${label}: target + dock done`);

    // A star route out and back.
    await jumpTo(page, 'alphaCentauri', label);
    await audit(page, `${label} alpha centauri`);
    await landOn(page, 'proximaB', label) && await relaunch(page, 'proximaB', label);
    await jumpTo(page, 'sol', label);

    // Down and up: the Moon, Mars, Earth.
    for (const site of ['moon', 'mars', 'earth']) {
      if (await landOn(page, site, label)) await relaunch(page, site, label);
    }

    // Pause, and everything in it.
    await openPause(page);
    await page.waitForTimeout(500);
    await shot(page, `${label}-10-pause`);
    await audit(page, `${label} pause`);
    for (const sheet of ['controls', 'settings']) {
      await page.evaluate((s) => window.__stellarGame.openOverlay(s), sheet);
      await page.waitForTimeout(400);
      await shot(page, `${label}-11-pause-${sheet}`);
      await audit(page, `${label} pause ${sheet}`);
      if (sheet === 'settings') break;
      await page.evaluate(() => window.__stellarGame.closeOverlay());
    }
    // Every preset, live, flying a few seconds on each.
    for (const q of ['performance', 'balanced', 'high', 'ultra', 'auto']) {
      await page.selectOption('#gs-quality', q);
      await page.evaluate(() => { window.__stellarGame.closeOverlay(); window.__stellarGame.resume(); });
      await waitState(page, 'playing', null, 20);
      const f0 = (await tel(page)).frame;
      await page.evaluate(() => { window.__stellarFlight.session.input.thrust = 0.6; });
      await page.waitForTimeout(3500);
      await page.evaluate(() => { window.__stellarFlight.session.input.thrust = 0; });
      const f1 = (await tel(page)).frame;
      const lvl = await page.evaluate(() => window.__stellarQuality.level());
      say(`${label}: preset ${q} → level ${lvl}, ${f1 - f0} frames in 3.5 s`);
      if (f1 <= f0) fail(`[${label}] flight stopped after switching to ${q}`);
      await shot(page, `${label}-12-preset-${q}`);
      await openPause(page);
      await page.evaluate(() => window.__stellarGame.openOverlay('settings'));
      await page.waitForTimeout(300);
    }
    // FOV and sensitivity, live.
    const fovBefore = await page.evaluate(() => window.__stellarFlight && document.querySelector('canvas') ? null : null);
    await page.$eval('#gs-fov', (el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '80'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.$eval('#gs-sens', (el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '2.5'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('stellar_explore_settings') ?? '{}'));
    if (s.fov !== 80 || s.sensitivity !== 2.5) fail(`[${label}] FOV/sensitivity did not save (${JSON.stringify(s)})`);
    await page.evaluate(() => { window.__stellarGame.closeOverlay(); window.__stellarGame.resume(); });
    await page.waitForTimeout(2500);
    await shot(page, `${label}-13-fov80`);
    void fovBefore;
    // Missions from the pause menu.
    await openPause(page);
    await page.evaluate(() => window.__stellarGame.openOverlay('missions'));
    await page.waitForTimeout(500);
    await shot(page, `${label}-14-missions`);
    await audit(page, `${label} missions`);
    // The language, mid-game: the page reloads into the other one.
    await page.evaluate(() => window.__stellarGame.openOverlay('settings'));
    await page.waitForTimeout(300);
    const other = LOCALE === 'en' ? 'ka' : 'en';
    await Promise.all([page.waitForEvent('load', { timeout: 300_000 }).catch(() => {}), page.click(`.game-setting__choice:nth-child(${other === 'en' ? 1 : 2})`)]);
    await waitFor(page, () => !!window.__stellarGame, `[${label}] the shell after the language switch`, 300);
    const after = await snap(page);
    const lang = await page.evaluate(() => document.documentElement.lang || document.cookie);
    say(`${label}: language → ${other}: state ${after?.state}/${after?.scene}, ${lang}`);
    await page.waitForTimeout(1500);
    await shot(page, `${label}-15-${other}-after-switch`);
    await audit(page, `${label} after → ${other}`);
    if (after?.state === 'title') {
      await hit(page, '.game-menu__item--primary');
    }
    await waitState(page, 'playing', null, 420);
    await page.waitForTimeout(1000);
    await shot(page, `${label}-16-${other}-playing`);
    await audit(page, `${label} ${other} playing`);
    if (await page.$('.flight-hud__explore')) {
      await startFlight(page, `${label}-${other}`);
      await shot(page, `${label}-17-${other}-flight`);
      await audit(page, `${label} ${other} flight`);
    }
    await openPause(page);
    await shot(page, `${label}-18-${other}-pause`);
    await audit(page, `${label} ${other} pause`);
    await page.evaluate(() => window.__stellarGame.openOverlay('settings'));
    await page.waitForTimeout(300);
    await shot(page, `${label}-19-${other}-settings`);
    await audit(page, `${label} ${other} settings`);
    await page.evaluate(() => window.__stellarGame.openOverlay('controls'));
    await page.waitForTimeout(300);
    await audit(page, `${label} ${other} controls`);
    await page.evaluate(() => window.__stellarGame.openOverlay('settings'));
    await Promise.all([page.waitForEvent('load', { timeout: 300_000 }).catch(() => {}), page.click(`.game-setting__choice:nth-child(${LOCALE === 'en' ? 1 : 2})`)]);
    await waitFor(page, () => !!window.__stellarGame, `[${label}] the shell after switching back`, 300);
    // Exit to the site, and back in.
    await waitFor(page, () => ['title', 'playing'].includes(window.__stellarGame.get().state), `[${label}] a state to exit from`, 420);
    await page.evaluate(() => window.__stellarGame.exit());
    await page.waitForURL(/\/solar-system/, { timeout: 120_000, waitUntil: 'commit' }).catch(() => fail(`[${label}] exit did not reach /solar-system`));
    say(`${label}: exit → ${page.url()}`);
    const cp = await page.evaluate(() => localStorage.getItem('stellar_explore_save'));
    await page.goto(`${BASE}/play`, { waitUntil: 'commit', timeout: 300_000 });
    await waitState(page, 'title');
    await page.waitForTimeout(800);
    await shot(page, `${label}-20-reentered`);
    const cont = await page.evaluate(() => [...document.querySelectorAll('.game-menu__item')].map((b) => b.textContent.trim()));
    say(`${label}: back in; checkpoint ${cp}; title offers ${cont.join(' | ')}`);
  } catch (e) {
    fail(`[${label}] ${e.message ?? e}`);
    await shot(page, `${label}-fail`);
  } finally {
    await context.close();
  }
}

const PHONES = [
  { id: 'iphone14-portrait', device: devices['iPhone 14'], insets: { top: 47, bottom: 34, left: 0, right: 0 } },
  { id: 'iphone14-landscape', device: devices['iPhone 14 landscape'], insets: { top: 0, bottom: 21, left: 47, right: 47 } },
  { id: 'pixel7-portrait', device: devices['Pixel 7'], insets: { top: 24, bottom: 0, left: 0, right: 0 } },
  { id: 'pixel7-landscape', device: devices['Pixel 7 landscape'], insets: { top: 0, bottom: 0, left: 24, right: 0 } },
];

async function phone(browser, ph, { land = false, locale = LOCALE } = {}) {
  const label = `${ph.id}-${locale}`;
  const { context, page } = await openContext(browser, { device: ph.device, safeArea: ph.insets, locale });
  watch(page, label);
  const a = (where) => audit(page, `${label} ${where}`, { touch: true, insets: ph.insets });
  try {
    await page.goto(`${BASE}/play`, { waitUntil: 'commit', timeout: 300_000 });
    if (!(await waitState(page, 'title'))) return;
    await page.waitForTimeout(1000);
    await shot(page, `${label}-01-title`);
    await a('title');
    await page.tap('.game-menu__item:nth-child(3)');
    await page.waitForTimeout(400);
    await shot(page, `${label}-02-settings`);
    await a('settings');
    await page.tap('.game-panel__close');
    await touchKey(page, '.game-menu__item--primary');
    if (!(await waitState(page, 'playing', 'orbit', 420))) return;
    await page.waitForTimeout(1200);
    await shot(page, `${label}-03-orrery`);
    await a('orrery');
    await waitFor(page, () => !!document.querySelector('.flight-hud__explore'), `[${label}] the Explore key`);
    await touchKey(page, '.flight-hud__explore');
    await waitFor(page, () => !!window.__stellarFlight?.session.active, `[${label}] the ship`);
    await waitFor(page, () => !document.querySelector('.flight-hud__launching:not(.is-done)'), `[${label}] the launch screen`, 180);
    await page.waitForTimeout(800);
    await shot(page, `${label}-04-flight`);
    await a('flight');
    // The stick, a thumb on it.
    const stick = await page.evaluate(() => { const r = document.querySelector('.flight-hud__move .game-stick')?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width } : null; });
    if (!stick) fail(`[${label}] no flight stick on a touch screen`);
    // The menu open.
    await page.tap('.flight-hud__top-keys .flight-hud__round');
    await page.waitForTimeout(400);
    await shot(page, `${label}-05-menu`);
    await a('flight menu');
    await page.tap('.flight-hud__top-keys .flight-hud__round');
    // The jump card's list.
    if (await page.$('.flight-drive__jump:not([disabled])')) {
      await page.tap('.flight-drive__jump');
      await page.waitForTimeout(300);
      await shot(page, `${label}-06-jump-menu`);
      await a('jump menu');
      await page.tap('.flight-drive__jump');
    }
    if (land) {
      const ok = await landOn(page, 'moon', label, { tap: true });
      if (ok) {
        await relaunch(page, 'moon', label);
        await a('relaunched');
      }
    }
    // Pause through the deck's own menu, the way a thumb does it.
    await page.tap('.flight-hud__top-keys .flight-hud__round');
    await page.waitForTimeout(300);
    await page.tap('.flight-hud__menu [role="menuitem"]:first-child');
    await waitState(page, 'paused', null, 20);
    await page.waitForTimeout(400);
    await shot(page, `${label}-07-pause`);
    await a('pause');
    for (const sheet of ['settings', 'controls']) {
      await page.evaluate((s) => window.__stellarGame.openOverlay(s), sheet);
      await page.waitForTimeout(400);
      await shot(page, `${label}-08-${sheet}`);
      await a(sheet);
    }
    await page.evaluate(() => window.__stellarGame.closeOverlay());
    await touchKey(page, '.game-menu__item--primary');
    await waitState(page, 'playing', null, 20);
    await page.waitForTimeout(800);
    if (!(await flying(page))) fail(`[${label}] resume from the pause menu left the deck paused`);
  } catch (e) {
    fail(`[${label}] ${e.message ?? e}`);
    await shot(page, `${label}-fail`);
  } finally {
    await context.close();
  }
}

async function leak(browser) {
  const label = 'leak';
  const { context, page } = await openContext(browser);
  watch(page, label);
  const rows = [];
  try {
    await page.goto(`${BASE}/play?orbit`, { waitUntil: 'commit', timeout: 300_000 });
    if (!(await waitState(page, 'playing', 'orbit', 420))) return;
    await startFlight(page, label);
    await page.waitForTimeout(2000);
    const sample = async (at) => {
      await page.evaluate(() => window.gc?.());
      const row = { at, heap: await heapMb(page), ...(await gpu(page)) };
      rows.push(row);
      say(`${label}: ${at} · heap ${row.heap} MB · ${row.contexts} ctx (${row.lost} lost) · buf ${row.buffers} tex ${row.textures} prog ${row.programs} fb ${row.framebuffers}`);
    };
    await sample('orbit-0');
    const sites = ['moon', 'mars', 'moon', 'earth', 'moon', 'mars', 'moon'];
    for (let i = 0; i < ROUNDS; i++) {
      const site = sites[i % sites.length];
      if (!(await landOn(page, site, `${label}${i + 1}`))) break;
      await page.waitForTimeout(1500);
      await sample(`${site}-${i + 1}`);
      if (!(await relaunch(page, site, `${label}${i + 1}`))) break;
      await page.waitForTimeout(2000);
      await sample(`orbit-${i + 1}`);
    }
    const orbits = rows.filter((r) => r.at.startsWith('orbit'));
    if (orbits.length > 2) {
      const first = orbits[1]; const last = orbits[orbits.length - 1];
      const d = (k) => last[k] - first[k];
      say(`${label}: orbit 1 → ${orbits.length - 1}: heap ${d('heap') >= 0 ? '+' : ''}${d('heap')} MB, buffers ${d('buffers')}, textures ${d('textures')}, programs ${d('programs')}, contexts ${last.contexts}`);
      if (last.contexts > 1) fail(`[${label}] ${last.contexts} live WebGL contexts in orbit after ${orbits.length - 1} round trips`);
      if (d('textures') > 8 || d('buffers') > 60 || d('programs') > 6) fail(`[${label}] GPU resources grow per round trip: ${JSON.stringify({ buffers: d('buffers'), textures: d('textures'), programs: d('programs') })}`);
      if (d('heap') > 80) fail(`[${label}] the heap grew ${d('heap')} MB over the round trips`);
    }
  } catch (e) {
    fail(`[${label}] ${e.message ?? e}`);
    await shot(page, `${label}-fail`);
  } finally {
    writeFileSync(`${OUT}leak.json`, JSON.stringify(rows, null, 2));
    await context.close();
  }
}

async function ctxLoss(browser) {
  const label = 'ctx';
  const { context, page } = await openContext(browser);
  watch(page, label);
  const lose = () => page.evaluate(() => {
    const c = [...document.querySelectorAll('.solar-system__canvas canvas')].pop();
    const gl = c?.getContext('webgl2') ?? c?.getContext('webgl');
    const ext = gl?.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    window.__qaLostCanvas = c;
    ext.loseContext();
    return true;
  });
  const recovered = (what) => waitFor(page, () => {
    const c = [...document.querySelectorAll('.solar-system__canvas canvas')].pop();
    return !!c && c !== window.__qaLostCanvas && !!window.__stellarOrrery;
  }, `[${label}] the scene to come back after losing the context ${what}`, 120);
  try {
    await page.goto(`${BASE}/play?orbit`, { waitUntil: 'commit', timeout: 300_000 });
    if (!(await waitState(page, 'playing', 'orbit', 420))) return;
    await page.waitForTimeout(1500);
    if (!(await lose())) { fail(`[${label}] no WEBGL_lose_context`); return; }
    if (await recovered('in the orrery')) {
      await page.waitForTimeout(2500);
      await shot(page, `${label}-1-orrery-back`);
      say(`${label}: orrery rebuilt on a new context`);
    }
    await startFlight(page, label);
    await page.waitForTimeout(1500);
    const before = await nearest(page);
    if (!(await lose())) return;
    if (await recovered('in flight')) {
      const back = await waitFor(page, () => !!window.__stellarFlight?.session.active && window.__stellarFlight.session.telemetry.frame > 0, `[${label}] the ship flying after the context came back`, 120);
      await page.waitForTimeout(2500);
      const f0 = (await tel(page))?.frame ?? 0;
      await page.waitForTimeout(2000);
      const f1 = (await tel(page))?.frame ?? 0;
      const after = await nearest(page);
      await shot(page, `${label}-2-flight-back`);
      say(`${label}: flight after the loss: ${back ? 'flying' : 'NOT FLYING'}, ${f1 - f0} frames in 2 s, near ${after.id} (was ${before.id})`);
      if (f1 <= f0) fail(`[${label}] the ship flies no frames after the context came back`);
      if (after.id !== before.id) fail(`[${label}] the context loss moved the ship from ${before.id} to ${after.id}`);
      await noStuckLoader(page, label);
    }
  } catch (e) {
    fail(`[${label}] ${e.message ?? e}`);
    await shot(page, `${label}-fail`);
  } finally {
    await context.close();
  }
}

// ── Run ────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE, args: [...GL_ARGS, '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const started = Date.now();
try {
  if (ONLY.includes('desktop')) await desktop(browser);
  if (ONLY.includes('phones')) {
    for (const [i, ph] of PHONES.entries()) await phone(browser, ph, { land: i === 0 });
    if (LOCALE === 'en') await phone(browser, PHONES[0], { locale: 'ka' });
    if (LOCALE === 'en') await phone(browser, PHONES[3], { locale: 'ka' });
  }
  if (ONLY.includes('ctx')) await ctxLoss(browser);
  if (ONLY.includes('leak')) await leak(browser);
} finally {
  await browser.close();
}

console.log(`\n${((Date.now() - started) / 60000).toFixed(1)} min · load average ${loadavg().map((n) => n.toFixed(1)).join(' / ')} · GL ${GL}`);
if (glWarnings.size) {
  console.log(`\nWebGL warnings (${glWarnings.size} kinds):`);
  for (const [k, n] of glWarnings) console.log(`  ${n}× ${k}`);
}
if (noted.length) console.log(`\nnoted (not Explore's): ${noted.length} line(s)`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  process.exitCode = 1;
} else {
  console.log(`\nevery check passed · shots in ${OUT}`);
}
