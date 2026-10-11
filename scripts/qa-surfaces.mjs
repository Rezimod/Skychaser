// Surface QA: node scripts/qa-surfaces.mjs [--url http://localhost:3102] [--out dir] [--only a,b] [--device desktop|iphone|iphone-land|pixel|pixel-land] [--size 1280x800] [--gl swiftshader|metal] [--cycles 5] [--harness [--preset high] [--ship kestrel]]
//
// Everything on and around the planets, driven through the dev hooks: the
// whole way down from orbit (every leg sampled), touchdown and egress, walking,
// running, jumping and the jetpack into walls and off ledges with the camera
// watched for clipping, the Moon base's interactions, the rover, the
// Backrooms, Mars build mode, crystals, Earth by day and night, the take-off
// back to orbit, every quality preset switched live, a lost GPU context, and
// land → take-off cycles counted for heap and live WebGL objects.
//
// Software GL (SwiftShader) runs a few frames a second, so scenarios lean on
// the skips and wait on telemetry rather than on the clock. Every scenario
// writes frames to --out and a line of JSON; problems are collected and
// printed at the end (exit 1 if any).
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
// --harness: the bare surface pages of scripts/qa-surface-harness (a Vite
// server: `npx vite --config scripts/qa-surface-harness/vite.config.mjs`,
// port 3112) instead of the game under Next — the same scenes and hooks
// without the shell, its HUD or a multi-gigabyte dev server.
const HARNESS = process.argv.includes('--harness');
const BASE = arg('url', HARNESS ? 'http://127.0.0.1:3112' : 'http://localhost:3102');
const ONLY = arg('only', '').split(',').filter(Boolean);
const DEVICE = arg('device', 'desktop');
const GL = arg('gl', 'swiftshader');
const OUT = `${arg('out', `${tmpdir()}/qa-surfaces`)}/`;
const CYCLES = Number(arg('cycles', '5'));
mkdirSync(OUT, { recursive: true });

/** Privy/WalletConnect/the placeholder app id, a request cut off as a scene
 *  leaves, and a context loss the run caused itself: none of it is a surface's. */
const NOISE = /KHR_parallel_shader_compile|privy|walletconnect|web3modal|reown|status of 403|status of 503|status of 401|Access is denied for this document|datadoghq|ERR_ABORTED|ERR_BLOCKED_BY_ORB|Failed to load resource|CONTEXT_LOST_WEBGL|Context Lost|terrarium|elevation-tiles|gibs/i;
const problems = [];
const noted = [];
const say = (s) => console.log(`· ${s}`);
const flag = (s) => { problems.push(s); console.log(`✗ ${s}`); };

const SIZE = arg('size', '1280x800').split('x').map(Number);
const DEVICES = {
  desktop: { viewport: { width: SIZE[0], height: SIZE[1] }, deviceScaleFactor: 1 },
  iphone: { ...devices['iPhone 14'] },
  'iphone-land': { ...devices['iPhone 14 landscape'] },
  pixel: { ...devices['Pixel 7'] },
  'pixel-land': { ...devices['Pixel 7 landscape'] },
};

/** Installed before any page script: WebGL object counts, draw calls, GL errors. */
function instrument() {
  const s = { frameCalls: 0, buffers: 0, textures: 0, programs: 0, framebuffers: 0, renderbuffers: 0, vaos: 0, texBytes: 0, glErrors: [], lost: 0 };
  window.__qa = s;
  const texSize = new WeakMap();
  for (const Ctx of [WebGL2RenderingContext, WebGLRenderingContext]) {
    const p = Ctx.prototype;
    const wrap = (name, fn) => {
      const orig = p[name];
      if (orig) p[name] = function (...a) { const r = orig.apply(this, a); fn(a, r, this); return r; };
    };
    wrap('drawArrays', () => { s.frameCalls++; });
    wrap('drawElements', () => { s.frameCalls++; });
    wrap('drawArraysInstanced', () => { s.frameCalls++; });
    wrap('drawElementsInstanced', () => { s.frameCalls++; });
    wrap('createBuffer', () => s.buffers++);
    wrap('deleteBuffer', (a) => { if (a[0]) s.buffers--; });
    wrap('createTexture', () => s.textures++);
    wrap('deleteTexture', (a) => { if (a[0]) { s.textures--; s.texBytes -= texSize.get(a[0]) ?? 0; texSize.delete(a[0]); } });
    wrap('createProgram', () => s.programs++);
    wrap('deleteProgram', (a) => { if (a[0]) s.programs--; });
    wrap('createFramebuffer', () => s.framebuffers++);
    wrap('deleteFramebuffer', (a) => { if (a[0]) s.framebuffers--; });
    wrap('createRenderbuffer', () => s.renderbuffers++);
    wrap('deleteRenderbuffer', (a) => { if (a[0]) s.renderbuffers--; });
    wrap('createVertexArray', () => s.vaos++);
    wrap('deleteVertexArray', (a) => { if (a[0]) s.vaos--; });
    // The bound texture's size, from the base level, so live texture memory can be estimated.
    const bound = new WeakMap();
    wrap('bindTexture', (a, _r, gl) => { bound.set(gl, a[1]); });
    const bpp = (fmt, type) => (type === 0x1406 ? 16 : type === 0x140b || type === 0x8d61 ? 8 : 4);
    wrap('texImage2D', (a, _r, gl) => {
      if (a[1] !== 0 || a.length < 9) return;
      const t = bound.get(gl); if (!t) return;
      const b = a[3] * a[4] * bpp(a[2], a[7]) * 1.33;
      s.texBytes += b - (texSize.get(t) ?? 0); texSize.set(t, b);
    });
    wrap('texStorage2D', (a, _r, gl) => {
      const t = bound.get(gl); if (!t) return;
      const b = a[3] * a[4] * 4 * (a[1] > 1 ? 1.33 : 1);
      s.texBytes += b - (texSize.get(t) ?? 0); texSize.set(t, b);
    });
  }
  const tick = () => { s.lastCalls = s.frameCalls; s.frameCalls = 0; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

const heapMB = (page) => page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576));
const gpuCounts = (page) => page.evaluate(() => {
  const s = window.__qa;
  return { buffers: s.buffers, textures: s.textures, programs: s.programs, framebuffers: s.framebuffers, renderbuffers: s.renderbuffers, vaos: s.vaos, texMB: Math.round(s.texBytes / 1048576), calls: s.lastCalls };
});

async function waitFor(page, fn, what, timeoutS = 240, arg) {
  const end = Date.now() + timeoutS * 1000;
  while (Date.now() < end) {
    if (await page.evaluate(fn, arg).catch(() => false)) return true;
    await page.waitForTimeout(500);
  }
  flag(`timed out (${timeoutS}s) waiting for ${what}`);
  return false;
}

let shotN = 0;
const shot = async (page, name) => {
  const path = `${OUT}${String(++shotN).padStart(3, '0')}-${DEVICE}-${name}.png`;
  await page.screenshot({ path }).catch(() => {});
  return path;
};

/** A dev server shared with other people's edits recompiles under the page:
 *  a chunk half-written or gone mid-load is the build, not the game. */
const BUILD_CHURN = /ChunkLoadError|Loading chunk .* failed|Invalid or unexpected token|Unexpected token '<'|Fast Refresh|__webpack_require__|hot-update/;

async function open(browser, url, { fresh = true } = {}) {
  const context = await browser.newContext({ ...DEVICES[DEVICE] });
  const page = await context.newPage();
  page.__churn = 0;
  page.on('pageerror', (e) => {
    if (BUILD_CHURN.test(e.message) || BUILD_CHURN.test(e.stack ?? '')) { page.__churn++; noted.push(`build churn: ${e.message.slice(0, 120)}`); return; }
    flag(`pageerror: ${e.message}`);
  });
  page.on('console', (m) => {
    const t = m.text();
    if (BUILD_CHURN.test(t)) { page.__churn++; noted.push(`build churn: ${t.slice(0, 120)}`); return; }
    const gl = /GL_INVALID|WebGL:|THREE\.WebGL|Mismatch between texture format/.test(t);
    if (m.type() !== 'error' && m.type() !== 'warning' && !gl) return;
    if (NOISE.test(t)) { noted.push(t.slice(0, 200)); return; }
    if (m.type() === 'warning' && !gl && !/Warning:|React|THREE\./.test(t)) { noted.push(t.slice(0, 200)); return; }
    flag(`console.${m.type()}: ${t.slice(0, 300)}`);
  });
  await page.addInitScript(instrument);
  await page.addInitScript(() => {
    window.addEventListener('unhandledrejection', (e) => console.error(`unhandledrejection: ${e.reason?.message ?? e.reason}`));
  });
  if (fresh) await page.addInitScript(() => {
    if (sessionStorage.getItem('qa-cleared')) return;
    sessionStorage.setItem('qa-cleared', '1');
    for (const k of Object.keys(localStorage)) if (k.startsWith('stellar_')) localStorage.removeItem(k);
    localStorage.setItem('stellar_sound', '0');
  });
  await page.goto(`${BASE}${url}`, { waitUntil: 'commit', timeout: 600_000 });
  // Until a surface hook is up: a load the build broke is loaded again.
  for (let tries = 0; tries < 4; tries++) {
    const end = Date.now() + 420_000;
    let up = false;
    while (Date.now() < end && !page.__churn) {
      up = await page.evaluate(() => !!(window.__stellarMoon || window.__stellarWorld)).catch(() => false);
      if (up) break;
      await page.waitForTimeout(1000);
    }
    if (up) break;
    say(`reloading ${url} (build churn ${page.__churn})`);
    page.__churn = 0;
    await page.waitForTimeout(8000);
    await page.goto(`${BASE}${url}`, { waitUntil: 'commit', timeout: 600_000 }).catch(() => {});
  }
  return { context, page };
}

const HOOK = { moon: '__stellarMoon', mars: '__stellarWorld', proximaB: '__stellarWorld', earth: '__stellarWorld' };
const PRESET = arg('preset', '');
const urlFor = (world) => (HARNESS ? `/index.html?world=${world}&fixedpx=1${PRESET ? `&preset=${PRESET}` : ''}${arg('ship', '') ? `&ship=${arg('ship', '')}` : ''}`
  : world === 'moon' ? '/play?moon=1&fixedpx=1' : `/play?land=${world}&fixedpx=1`);

/** NaN or Infinity anywhere in the numbers the glass reads. */
const badNumbers = (page, h) => page.evaluate((h) => {
  const bad = [];
  const walk = (o, path, depth) => {
    if (!o || depth > 3) return;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'number' && !Number.isFinite(v)) bad.push(`${path}${k}=${v}`);
      else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Node)) walk(v, `${path}${k}.`, depth + 1);
    }
  };
  walk(window[h]?.telemetry, '', 0);
  return bad;
}, h);

/** The camera against the ground and the scene: height over the terrain under it. */
const camState = (page, h) => page.evaluate((h) => {
  const g = window.__stellarGlobe;
  const m = window[h];
  const c = m.cameraAt ? m.cameraAt() : null;
  return { alt: g ? Math.round(g.altitude()) : null, clearance: c ? +c.clearance.toFixed(2) : null, blocked: c ? c.blocked : null, stats: g ? g.stats() : null };
}, h);

async function onSurface(page, world, { skip = true } = {}) {
  const h = HOOK[world];
  if (!(await waitFor(page, (h) => !!window[h]?.telemetry?.ready, `${world} ready`, 600, h))) return false;
  if (skip) await page.evaluate((h) => window[h].skipDescent(), h);
  return waitFor(page, (h) => window[h].telemetry.phase === 'surface', `${world} surface`, 120, h);
}

// ── Scenarios ──

/** The whole way down from orbit, sampled; then egress, take-off, orbit. */
async function descent(browser, world, { fromEntry = false, full = true } = {}) {
  const h = HOOK[world];
  const { context, page } = await open(browser, urlFor(world));
  const rows = [];
  try {
    if (!(await waitFor(page, (h) => !!window[h]?.telemetry?.ready, `${world} ready`, 600, h))) return;
    await page.waitForTimeout(1500);
    await shot(page, `${world}-orbit-open`);
    if (fromEntry) await page.evaluate((h) => window[h].skipToEntry(), h);
    let lastPhase = '';
    let lastLeg = '';
    const t0 = Date.now();
    let lastShot = 0;
    let minClear = Infinity;
    while (Date.now() - t0 < 900_000) {
      const s = await page.evaluate((h) => {
        const m = window[h]; const T = m.telemetry; const o = T.orbital;
        const g = window.__stellarGlobe;
        return {
          phase: T.phase, leg: o?.phase ?? '', alt: o ? Math.round(o.altitude) : Math.round(T.landing?.altitude ?? 0),
          speed: o ? Math.round(o.speed) : null, heat: o ? +o.heat.toFixed(2) : null, warp: o ? +o.timeWarp.toFixed(1) : null,
          camAlt: g ? Math.round(g.altitude()) : null, globe: g ? g.stats() : null, exitReady: T.exitReady,
        };
      }, h);
      const bad = await badNumbers(page, h);
      if (bad.length) flag(`${world} ${s.phase}/${s.leg}: non-finite telemetry ${bad.slice(0, 5).join(', ')}`);
      const key = `${s.phase}/${s.leg}`;
      rows.push({ t: Math.round((Date.now() - t0) / 1000), ...s, globe: undefined, chunks: s.globe?.chunks, tiles: s.globe?.tiles });
      if (s.phase !== lastPhase || s.leg !== lastLeg || Date.now() - lastShot > 20_000) {
        say(`${world} ${key} alt ${s.alt} m, cam ${s.camAlt} m, v ${s.speed} m/s, heat ${s.heat}, ×${s.warp} ${s.globe ? `globe ${JSON.stringify(s.globe)}` : ''}`);
        await shot(page, `${world}-${s.phase}-${s.leg || 'x'}-${s.alt}`);
        lastShot = Date.now();
      }
      lastPhase = s.phase; lastLeg = s.leg;
      if (s.phase === 'touchdown' || s.phase === 'surface') break;
      // The camera must never go under the ground on the way down.
      if (s.phase === 'descent' && world === 'moon') {
        const c = await camState(page, h);
        if (c.clearance !== null) minClear = Math.min(minClear, c.clearance);
      }
      await page.waitForTimeout(1500);
    }
    if (lastPhase !== 'touchdown' && lastPhase !== 'surface') { flag(`${world}: descent never reached the ground (last ${lastPhase}/${lastLeg})`); return; }
    if (minClear < 0.2) flag(`${world}: camera clearance ${minClear} m during the powered descent`);
    await page.waitForTimeout(1500);
    await shot(page, `${world}-touchdown`);
    await waitFor(page, (h) => window[h].telemetry.exitReady || window[h].telemetry.phase === 'surface', `${world} exit ready`, 60, h);
    await page.evaluate((h) => { window[h].input.interact = true; }, h);
    await waitFor(page, (h) => window[h].telemetry.phase === 'surface', `${world} egress`, 60, h);
    await page.waitForTimeout(2500);
    await shot(page, `${world}-egress`);
    if (!full) return;
    await takeOff(page, world);
  } finally {
    writeFileSync(`${OUT}descent-${world}-${DEVICE}.json`, JSON.stringify(rows, null, 1));
    await context.close();
  }
}

/** Board the ship and fly to orbit; returns whether `ascended` came up. */
async function takeOff(page, world, { shots = true } = {}) {
  const h = HOOK[world];
  const forced = await page.evaluate((h) => window[h].forceInteract('boardLander'), h);
  if (!forced) { flag(`${world}: no boardLander interaction`); return false; }
  const up = await waitFor(page, (h) => window[h].telemetry.phase === 'ascent', `${world} ascent to begin`, 30, h);
  if (!up) return false;
  let last = '';
  const t0 = Date.now();
  let seenAscended = false;
  while (Date.now() - t0 < 600_000) {
    const s = await page.evaluate((h) => {
      const T = window[h]?.telemetry;
      if (!T) return { gone: true };
      return { gone: false, phase: T.phase, leg: T.orbital?.phase ?? '', alt: Math.round(T.orbital?.altitude ?? 0), asc: T.ascended };
    }, h).catch(() => ({ gone: true }));
    if (s.gone) { seenAscended = true; break; }
    const bad = await badNumbers(page, h).catch(() => []);
    if (bad.length) flag(`${world} ascent: non-finite telemetry ${bad.slice(0, 5).join(', ')}`);
    const key = `${s.phase}/${s.leg}`;
    if (key !== last) {
      say(`${world} ascent ${key} alt ${s.alt} m`);
      if (shots) await shot(page, `${world}-ascent-${s.leg || 'climb'}-${s.alt}`);
      last = key;
    }
    if (s.asc) { seenAscended = true; break; }
    await page.waitForTimeout(1500);
  }
  if (!seenAscended) flag(`${world}: take-off never reached orbit (last ${last})`);
  return seenAscended;
}

/** Walk, run, sprint, jump and jet into things; the camera must stay clear. */
async function locomotion(browser, world) {
  const h = HOOK[world];
  const { context, page } = await open(browser, urlFor(world));
  try {
    if (!(await onSurface(page, world))) return;
    await page.waitForTimeout(1500);
    const input = (patch) => page.evaluate(([h, p]) => Object.assign(window[h].input, p), [h, patch]);
    const results = [];
    const spots = world === 'moon'
      ? await page.evaluate(() => window.__stellarMoon.cameraSpots())
      : [{ id: 'start', ...(await page.evaluate((h) => window[h].where(), h)) }];
    for (const sp of spots) {
      await page.evaluate(([h, sp]) => window[h].teleport(sp.x, sp.z), [h, sp]);
      for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        await page.evaluate(([h, dx, dz]) => window[h].face(dx, dz), [h, dx, dz]);
        await input({ moveY: 1, run: true });
        await page.waitForTimeout(1500);
        await input({ jump: true }); await page.waitForTimeout(400); await input({ jump: false });
        await page.waitForTimeout(800);
        await input({ moveY: 0, run: false });
        const c = await page.evaluate((h) => {
          const m = window[h];
          const cam = m.cameraAt ? m.cameraAt() : null;
          const w = m.where();
          return { cam, w };
        }, h);
        const bad = await badNumbers(page, h);
        if (bad.length) flag(`${world} walk at ${sp.id}: non-finite ${bad.join(',')}`);
        if (c.cam && (c.cam.blocked || c.cam.clearance < 0.15)) {
          flag(`${world}: camera at ${sp.id} facing ${dx},${dz}: blocked=${c.cam.blocked} clearance=${c.cam.clearance.toFixed(2)}`);
          await shot(page, `${world}-cam-${sp.id}-${dx}${dz}`);
        }
        results.push({ spot: sp.id, dx, dz, ...c.w, clear: c.cam?.clearance });
      }
    }
    // The jetpack: hold jump in the air, then let go, and come down.
    await input({ jump: true });
    await page.waitForTimeout(3000);
    const jet = await page.evaluate((h) => ({ fuel: window[h].telemetry.jetFuel, jetting: window[h].telemetry.jetting, alt: window[h].telemetry.altitude }), h);
    await shot(page, `${world}-jetpack`);
    await input({ jump: false });
    await page.waitForTimeout(4000);
    const after = await page.evaluate((h) => ({ fuel: window[h].telemetry.jetFuel, alt: window[h].telemetry.altitude, grounded: window[h].telemetry.grounded }), h);
    say(`${world} jetpack: during ${JSON.stringify(jet)}, after ${JSON.stringify(after)}`);
    // Every view.
    for (let i = 0; i < 3; i++) {
      await input({ viewCycle: true });
      await page.waitForTimeout(1500);
      await shot(page, `${world}-view-${i}`);
    }
    writeFileSync(`${OUT}walk-${world}-${DEVICE}.json`, JSON.stringify(results, null, 1));
    say(`${world}: walked ${results.length} legs`);
  } finally { await context.close(); }
}

/** Every quality preset, live, on one surface. */
async function presets(browser, world) {
  const h = HOOK[world];
  const { context, page } = await open(browser, urlFor(world));
  try {
    if (!(await onSurface(page, world))) return;
    await page.waitForTimeout(1500);
    const has = await page.evaluate(() => !!window.__stellarQuality);
    if (!has) { flag('no __stellarQuality hook'); return; }
    for (const level of ['ultra', 'high', 'balanced', 'performance', 'high']) {
      await page.evaluate((l) => window.__stellarQuality.set ? window.__stellarQuality.set(l) : window.__stellarQuality.pretend?.(l), level);
      await page.waitForTimeout(3000);
      const g = await gpuCounts(page);
      const perf = await page.evaluate((h) => { const p = window[h].perf(); return { calls: p.calls, tris: p.triangles, ratio: p.pixelRatio }; }, h);
      say(`${world} preset ${level}: ${JSON.stringify(perf)} gpu ${JSON.stringify(g)}`);
      await shot(page, `${world}-preset-${level}`);
    }
  } finally { await context.close(); }
}

/** Land → take off → orbit, `CYCLES` times on one world, heap and GPU counts each time. */
async function cycles(browser, world) {
  const h = HOOK[world];
  const { context, page } = await open(browser, urlFor(world));
  const rows = [];
  try {
    for (let i = 0; i < CYCLES; i++) {
      if (!(await onSurface(page, world))) return;
      await page.waitForTimeout(2000);
      const on = { heap: await heapMB(page), ...(await gpuCounts(page)) };
      const ok = await takeOff(page, world, { shots: false });
      if (!ok) return;
      // The flight scene takes over; then land again.
      if (HARNESS) await waitFor(page, () => window.__qaHarness.disposed, 'surface to unmount', 120);
      else await waitFor(page, () => window.__stellarGame?.get().scene !== undefined && !window.__stellarMoon && !window.__stellarWorld, 'surface to unmount', 120);
      await page.waitForTimeout(3000);
      await page.evaluate(() => { if (window.gc) window.gc(); });
      const off = { heap: await heapMB(page), ...(await gpuCounts(page)) };
      rows.push({ i, on, off });
      say(`${world} cycle ${i + 1}: on surface ${JSON.stringify(on)} · after take-off ${JSON.stringify(off)}`);
      if (HARNESS) await page.evaluate(() => window.__qaHarness.remount(false));
      else await page.evaluate((w) => window.__stellarGame.travel(w === 'moon' ? 'moon' : w), world);
    }
    const a = rows[0]; const b = rows[rows.length - 1];
    if (a && b && rows.length > 2) {
      for (const k of ['buffers', 'textures', 'programs', 'framebuffers', 'renderbuffers', 'vaos']) {
        const d = b.on[k] - rows[1].on[k];
        if (d > 8) flag(`${world}: live ${k} grew ${d} between cycle 2 and ${rows.length} on the surface`);
      }
      if (b.on.heap - rows[1].on.heap > 60) flag(`${world}: heap grew ${b.on.heap - rows[1].on.heap} MB between cycle 2 and ${rows.length}`);
    }
  } finally {
    writeFileSync(`${OUT}cycles-${world}-${DEVICE}.json`, JSON.stringify(rows, null, 1));
    await context.close();
  }
}

/** A lost GPU context on the surface: the scene comes back, no black screen. */
async function contextLoss(browser, world) {
  const h = HOOK[world];
  const { context, page } = await open(browser, urlFor(world));
  try {
    if (!(await onSurface(page, world))) return;
    await page.waitForTimeout(1500);
    const before = await page.evaluate((h) => window[h].where(), h);
    await page.evaluate(() => {
      const c = document.querySelector('canvas');
      const gl = c.getContext('webgl2') ?? c.getContext('webgl');
      window.__qaLose = gl.getExtension('WEBGL_lose_context');
      window.__qaLose.loseContext();
    });
    await page.waitForTimeout(3000);
    const back = await waitFor(page, (h) => !!window[h]?.telemetry?.ready && window[h].telemetry.phase === 'surface', `${world} after context loss`, 300, h);
    await page.waitForTimeout(2000);
    await shot(page, `${world}-after-ctxloss`);
    if (back) {
      const after = await page.evaluate((h) => window[h].where(), h);
      say(`${world} context loss: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
      const dark = await page.evaluate(() => {
        const c = document.querySelector('canvas');
        return c ? `${c.width}x${c.height}` : 'no canvas';
      });
      say(`${world} canvas after loss: ${dark}`);
    }
  } finally { await context.close(); }
}

/** The HUD on a phone: touch targets, overlap, safe areas, Georgian. */
async function hud(browser, world, { lang = 'en' } = {}) {
  const h = HOOK[world];
  const { context, page } = await open(browser, `${urlFor(world)}${lang === 'ka' ? '&lang=ka' : ''}`);
  try {
    if (lang === 'ka') await context.addCookies([{ name: 'NEXT_LOCALE', value: 'ka', url: BASE }]);
    if (!(await waitFor(page, (h) => !!window[h]?.telemetry?.ready, `${world} ready`, 600, h))) return;
    await page.waitForTimeout(2500);
    await shot(page, `${world}-hud-orbit-${lang}`);
    await checkHud(page, `${world} orbit`);
    await page.evaluate((h) => window[h].skipToEntry(), h);
    await page.waitForTimeout(4000);
    await shot(page, `${world}-hud-entry-${lang}`);
    await checkHud(page, `${world} entry`);
    await page.evaluate((h) => window[h].skipOrbit(), h);
    await page.waitForTimeout(3000);
    await shot(page, `${world}-hud-descent-${lang}`);
    await checkHud(page, `${world} descent`);
    await page.evaluate((h) => window[h].skipDescent(), h);
    await waitFor(page, (h) => window[h].telemetry.phase === 'surface', `${world} surface`, 60, h);
    await page.waitForTimeout(3000);
    await shot(page, `${world}-hud-surface-${lang}`);
    await checkHud(page, `${world} surface`);
  } finally { await context.close(); }
}

async function checkHud(page, where) {
  const r = await page.evaluate(() => {
    const vw = innerWidth; const vh = innerHeight;
    const out = { small: [], offscreen: [], overlaps: [], clipped: [] };
    const vis = (el) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05 && b.width > 0 && b.height > 0; };
    const name = (el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`;
    const roots = document.querySelectorAll('.moon-hud, .world-hud, [class*="moon-hud"], [class*="world-hud"]');
    const scope = roots.length ? [...roots] : [document.body];
    const btns = [];
    for (const r of scope) for (const b of r.querySelectorAll('button, [role="button"], a')) if (vis(b)) btns.push(b);
    const coarse = matchMedia('(pointer: coarse)').matches;
    for (const b of btns) {
      const bb = b.getBoundingClientRect();
      if (coarse && (bb.width < 43.5 || bb.height < 43.5)) out.small.push(`${name(b)} ${Math.round(bb.width)}×${Math.round(bb.height)}`);
      if (bb.right > vw + 1 || bb.bottom > vh + 1 || bb.left < -1 || bb.top < -1) out.offscreen.push(`${name(b)} @${Math.round(bb.left)},${Math.round(bb.top)} ${Math.round(bb.width)}×${Math.round(bb.height)}`);
    }
    for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
      const a = btns[i].getBoundingClientRect(); const b = btns[j].getBoundingClientRect();
      if (btns[i].contains(btns[j]) || btns[j].contains(btns[i])) continue;
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ix > 4 && iy > 4) out.overlaps.push(`${name(btns[i])} × ${name(btns[j])}`);
    }
    // Text cut off by its own box.
    for (const r of scope) for (const el of r.querySelectorAll('*')) {
      if (!vis(el) || el.children.length) continue;
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible' && el.textContent.trim()) out.clipped.push(`${name(el)} "${el.textContent.trim().slice(0, 30)}"`);
    }
    return out;
  });
  for (const k of ['small', 'offscreen', 'overlaps']) if (r[k].length) flag(`${where} [${DEVICE}] ${k}: ${[...new Set(r[k])].slice(0, 8).join(' | ')}`);
  if (r.clipped.length) noted.push(`${where} [${DEVICE}] clipped text: ${[...new Set(r.clipped)].slice(0, 8).join(' | ')}`);
}

/** The Moon base: every interaction, the rover, carrying, the Backrooms. */
async function moonBase(browser) {
  const h = '__stellarMoon';
  const { context, page } = await open(browser, urlFor('moon'));
  try {
    if (!(await onSurface(page, 'moon'))) return;
    await page.waitForTimeout(1500);
    const ids = ['suitCheck', 'deadCable', 'coupling', 'fitCoupling', 'breaker', 'mountPower', 'mountAlign', 'scopeObserve', 'dishInspect', 'feed', 'fitFeed', 'dishAlign', 'roverCharge'];
    for (const m of ['firstSteps', 'power', 'telescope', 'comms', 'expedition']) {
      const got = await page.evaluate((m) => window.__stellarMoon.startMission(m), m);
      say(`mission ${m}: ${got}`);
      for (const id of ids) {
        const ok = await page.evaluate((id) => window.__stellarMoon.forceInteract(id, 4), id);
        if (ok) { await page.waitForTimeout(500); }
      }
      await shot(page, `moon-mission-${m}`);
    }
    // The rover: in, drive into the base, out.
    await page.evaluate(() => { const m = window.__stellarMoon; const r = m.roverAt(); m.teleport(r.x + 2, r.z); m.forceInteract('roverEnter', 2); });
    const driving = await waitFor(page, () => window.__stellarMoon.telemetry.driving === true, 'the rover', 30);
    if (driving) {
      await page.evaluate(() => { const i = window.__stellarMoon.input; i.moveY = 1; i.gearRequest = 2; });
      for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(1500);
        const c = await camState(page, h);
        const bad = await badNumbers(page, h);
        if (bad.length) flag(`rover: non-finite ${bad.join(',')}`);
        if (c.blocked || (c.clearance !== null && c.clearance < 0.15)) { flag(`rover camera: clearance ${c.clearance} blocked ${c.blocked}`); await shot(page, `moon-rover-cam-${i}`); }
      }
      await shot(page, 'moon-rover-drive');
      await page.evaluate(() => { const i = window.__stellarMoon.input; i.moveY = 0; window.__stellarMoon.forceInteract('roverExit', 2); });
      await page.waitForTimeout(2500);
      const off = await page.evaluate(() => window.__stellarMoon.telemetry.driving);
      if (off) flag('could not get off the rover');
    }
    // Jobs.
    for (const j of ['solar', 'regolith', 'antenna', 'samples']) {
      await page.evaluate((j) => window.__stellarMoon.startJob(j), j).catch(() => {});
      await page.waitForTimeout(400);
    }
    const tel = await page.evaluate(() => ({ jobs: window.__stellarMoon.telemetry.jobs, missions: window.__stellarMoon.telemetry.missions.done }));
    say(`moon: jobs ${JSON.stringify(tel.jobs).slice(0, 200)} missions done ${tel.missions}`);
    // The Backrooms.
    await page.evaluate(() => window.__stellarMoon.fallIntoBackrooms());
    const under = await waitFor(page, () => (window.__stellarMoon.telemetry.backrooms.phase ?? '') !== '', 'the Backrooms', 60);
    if (under) {
      for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(2000);
        const p = await page.evaluate(() => window.__stellarMoon.telemetry.backrooms.phase);
        await shot(page, `moon-backrooms-${p}-${i}`);
        if (p === 'inside' || p === 'roam' || p === 'lost') break;
      }
      const bad = await badNumbers(page, h);
      if (bad.length) flag(`backrooms: non-finite ${bad.join(',')}`);
      await page.evaluate(() => { const i = window.__stellarMoon.input; i.moveY = 1; i.run = true; });
      await page.waitForTimeout(3000);
      await page.evaluate(() => { const i = window.__stellarMoon.input; i.moveY = 0; i.run = false; });
      await shot(page, 'moon-backrooms-walk');
      await page.evaluate(() => window.__stellarMoon.teleportToExit());
      await page.waitForTimeout(2000);
      await page.evaluate(() => window.__stellarMoon.escapeBackrooms());
      await waitFor(page, () => !window.__stellarMoon.telemetry.backrooms.phase || window.__stellarMoon.telemetry.backrooms.phase === 'surface' || window.__stellarMoon.telemetry.backrooms.phase === 'done', 'out of the Backrooms', 60);
      await page.waitForTimeout(2500);
      await shot(page, 'moon-after-backrooms');
      const t = await page.evaluate(() => ({ phase: window.__stellarMoon.telemetry.phase, br: window.__stellarMoon.telemetry.backrooms.phase, where: window.__stellarMoon.where() }));
      say(`after the Backrooms: ${JSON.stringify(t)}`);
    }
    // Build mode.
    const b = await page.evaluate(() => { const b = window.__stellarMoon.build; return b ? Object.keys(b) : null; });
    say(`moon build handle: ${b}`);
  } finally { await context.close(); }
}

async function marsBuild(browser) {
  const { context, page } = await open(browser, urlFor('mars'));
  try {
    if (!(await onSurface(page, 'mars'))) return;
    await page.waitForTimeout(1500);
    const keys = await page.evaluate(() => { const b = window.__stellarWorld.build; return b ? Object.keys(b) : null; });
    say(`mars build handle: ${keys}`);
    const r = await page.evaluate(async () => {
      const b = window.__stellarWorld.build;
      const out = [];
      if (!b) return out;
      try { b.toggle?.(true) ?? b.open?.() ?? b.setActive?.(true); } catch (e) { out.push(`toggle: ${e.message}`); }
      await new Promise((r) => setTimeout(r, 1500));
      out.push(JSON.stringify(b.telemetry ?? {}).slice(0, 300));
      return out;
    });
    say(`mars build: ${r.join(' | ')}`);
    await shot(page, 'mars-build');
    await page.evaluate(() => { window.__stellarWorld.input.interact = true; });
    await page.waitForTimeout(1500);
    await shot(page, 'mars-build-placed');
    const crystals = await page.evaluate(() => ({ c: window.__stellarWorld.telemetry.crystals, t: window.__stellarWorld.telemetry.crystalsTotal }));
    say(`mars crystals: ${JSON.stringify(crystals)}`);
  } finally { await context.close(); }
}

async function earthDayNight(browser) {
  const h = '__stellarWorld';
  const { context, page } = await open(browser, urlFor('earth'));
  try {
    if (!(await onSurface(page, 'earth'))) return;
    await page.waitForTimeout(2000);
    for (const iso of ['2026-06-21T08:00:00Z', '2026-06-21T13:00:00Z', '2026-06-21T16:30:00Z', '2026-06-21T20:00:00Z', '2026-12-21T23:00:00Z']) {
      await page.evaluate((iso) => window.__stellarWorld.setTime(iso), iso);
      await page.waitForTimeout(3000);
      await shot(page, `earth-time-${iso.slice(5, 13)}`);
      const bad = await badNumbers(page, h);
      if (bad.length) flag(`earth ${iso}: non-finite ${bad.join(',')}`);
    }
  } finally { await context.close(); }
}

/** The globe at heights, as the pin holds it: seams, popping, the patch edge. */
async function globeHeights(browser, world) {
  const h = HOOK[world];
  const { context, page } = await open(browser, urlFor(world));
  try {
    if (!(await onSurface(page, world))) return;
    await page.waitForTimeout(1500);
    const heights = world === 'earth' ? [300, 1500, 4000, 6000, 9000, 11500, 13000, 20000, 40000, 120000, 400000] : [300, 1500, 2500, 4000, 6000, 7900, 8500, 15000, 60000, 250000];
    for (const alt of heights) {
      await page.evaluate((a) => window.__stellarGlobe.lift(a, 10), alt);
      // Let the quadtree settle: a few seconds at software-GL frame rates.
      let st = null;
      for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(1500);
        st = await page.evaluate(() => window.__stellarGlobe.stats());
        if (!st.pending && !st.queued && !st.building) break;
      }
      say(`${world} globe @${alt} m: ${JSON.stringify(st)}`);
      await shot(page, `${world}-globe-${alt}`);
    }
    await page.evaluate(() => window.__stellarGlobe.lift(null));
  } finally { await context.close(); }
}

/** The entry at its hottest: frames of the plasma, and the hull under it. */
async function plasma(browser, world) {
  const h = HOOK[world];
  const { context, page } = await open(browser, urlFor(world));
  try {
    if (!(await waitFor(page, (h) => !!window[h]?.telemetry?.ready, `${world} ready`, 600, h))) return;
    await page.evaluate((h) => window[h].skipToEntry(), h);
    let shots = 0;
    const t0 = Date.now();
    let peak = 0;
    // A frame as the heat passes each mark on the way up, at the peak, and on the way down.
    const marks = [0.35, 0.65, 0.9, 0.99];
    let falling = false;
    while (Date.now() - t0 < 900_000 && shots < 7) {
      const s = await page.evaluate((h) => { const o = window[h].telemetry.orbital; return o ? { heat: o.heat, alt: Math.round(o.altitude), leg: o.phase, mach: o.mach } : null; }, h);
      if (!s) break;
      peak = Math.max(peak, s.heat);
      let take = false;
      if (marks.length && s.heat >= marks[0]) { while (marks.length && s.heat >= marks[0]) marks.shift(); take = true; }
      if (peak > 0.5 && !falling && s.heat < peak * 0.8) { falling = true; take = true; }
      if (falling === true && s.heat < 0.3) { take = true; falling = 'done'; }
      if (take) {
        await shot(page, `${world}-plasma-h${s.heat.toFixed(2)}-${s.alt}`);
        say(`${world} plasma: heat ${s.heat.toFixed(2)} at ${s.alt} m, mach ${s.mach.toFixed(1)}`);
        shots++;
      }
      if (s.leg === 'glide' && s.heat < 0.05) break;
      await page.waitForTimeout(2500);
    }
  } finally { await context.close(); }
}

/** The cosmonaut close up, and the shadows at the feet, on each preset. */
async function closeup(browser, world) {
  const h = HOOK[world];
  const { context, page } = await open(browser, urlFor(world));
  try {
    if (!(await onSurface(page, world))) return;
    await page.waitForTimeout(2000);
    // Turn the crew side-on to the sun so the shadow falls beside them.
    for (const level of ['high', 'performance', 'ultra']) {
      await page.evaluate((l) => window.__stellarQuality.pretend(l), level);
      await page.waitForTimeout(2500);
      for (const [name, off] of [['body', [2.2, 1.3, 2.2]], ['feet', [1.1, 0.35, 1.3]], ['wide', [5, 2.6, -4]]]) {
        await page.evaluate(([h, o]) => window[h].devCamera(o), [h, off]);
        await page.waitForTimeout(2500);
        await shot(page, `${world}-closeup-${level}-${name}`);
      }
    }
    await page.evaluate((h) => window[h].devCamera(null), h);
  } finally { await context.close(); }
}

const SCENARIOS = {
  'closeup-moon': (b) => closeup(b, 'moon'),
  'closeup-mars': (b) => closeup(b, 'mars'),
  'closeup-proximaB': (b) => closeup(b, 'proximaB'),
  'plasma-earth': (b) => plasma(b, 'earth'),
  'plasma-mars': (b) => plasma(b, 'mars'),
  'descent-moon': (b) => descent(b, 'moon'),
  'descent-mars': (b) => descent(b, 'mars'),
  'descent-earth': (b) => descent(b, 'earth'),
  'entry-moon': (b) => descent(b, 'moon', { fromEntry: true }),
  'entry-mars': (b) => descent(b, 'mars', { fromEntry: true }),
  'entry-earth': (b) => descent(b, 'earth', { fromEntry: true }),
  'descent-proximaB': (b) => descent(b, 'proximaB', { full: true }),
  'walk-moon': (b) => locomotion(b, 'moon'),
  'walk-mars': (b) => locomotion(b, 'mars'),
  'walk-proximaB': (b) => locomotion(b, 'proximaB'),
  'walk-earth': (b) => locomotion(b, 'earth'),
  'presets-moon': (b) => presets(b, 'moon'),
  'presets-mars': (b) => presets(b, 'mars'),
  'presets-proximaB': (b) => presets(b, 'proximaB'),
  'presets-earth': (b) => presets(b, 'earth'),
  'cycles-moon': (b) => cycles(b, 'moon'),
  'cycles-mars': (b) => cycles(b, 'mars'),
  'cycles-earth': (b) => cycles(b, 'earth'),
  'ctx-moon': (b) => contextLoss(b, 'moon'),
  'ctx-mars': (b) => contextLoss(b, 'mars'),
  'ctx-earth': (b) => contextLoss(b, 'earth'),
  'hud-moon': (b) => hud(b, 'moon'),
  'hud-mars': (b) => hud(b, 'mars'),
  'hud-earth': (b) => hud(b, 'earth'),
  'hud-moon-ka': (b) => hud(b, 'moon', { lang: 'ka' }),
  'moon-base': (b) => moonBase(b),
  'mars-build': (b) => marsBuild(b),
  'earth-time': (b) => earthDayNight(b),
  'globe-moon': (b) => globeHeights(b, 'moon'),
  'globe-mars': (b) => globeHeights(b, 'mars'),
  'globe-earth': (b) => globeHeights(b, 'earth'),
};

const glArgs = GL === 'metal'
  ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: [...glArgs, '--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
const run = ONLY.length ? ONLY : Object.keys(SCENARIOS);
for (const name of run) {
  const fn = SCENARIOS[name];
  if (!fn) { flag(`no scenario ${name}`); continue; }
  const t0 = Date.now();
  say(`── ${name} [${DEVICE}] ──`);
  try { await fn(browser); } catch (e) { flag(`${name}: ${e.message ?? e}`); }
  say(`${name} took ${Math.round((Date.now() - t0) / 1000)} s`);
}
await browser.close();
writeFileSync(`${OUT}problems-${DEVICE}-${run.join('+').slice(0, 60)}.json`, JSON.stringify({ problems, noted: [...new Set(noted)].slice(0, 100) }, null, 1));
console.log(`\n${problems.length} problem(s)`);
for (const p of problems) console.log(`  - ${p}`);
console.log(`${new Set(noted).size} noted (noise)`);
process.exit(problems.length ? 1 : 0);
