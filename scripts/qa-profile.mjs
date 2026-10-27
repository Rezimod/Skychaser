// Where the time goes, per phase of play, on the machine's own GPU.
//
//   node scripts/qa-profile.mjs [--url http://localhost:3000] [--site earth]
//        [--profile desktop|phone] [--cpu 4] [--quality high] [--out dir]
//        [--phases cruise,approach,land,walk,ascent]
//
// Needs a QA build (NEXT_PUBLIC_GAME_QA=1) and, for names that mean
// something, its browser source maps (QA_SOURCEMAPS=1). Plays the same flow
// as qa-responsiveness, records a V8 CPU profile of each phase, and prints
// per phase: the frame times, every long animation frame over 50 ms, and the
// functions (mapped back to src/) that took the most time, self and total.
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import sourceMap from 'source-map';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('url', 'http://localhost:3000');
const SITE = arg('site', 'earth');
const PROFILE = arg('profile', 'desktop');
const CPU = Number(arg('cpu', '1'));
const QUALITY = arg('quality', '');
const OUT = `${arg('out', './qa-profile')}/`;
const SHOTS = process.argv.includes('--shots');
const PHASES = arg('phases', 'cruise,approach,land,walk,ascent').split(',');
mkdirSync(OUT, { recursive: true });
const phone = PROFILE === 'phone';
const say = (m) => console.log(m);

// ── Source maps, fetched from the server once per chunk. ──
const maps = new Map();
async function mapFor(url) {
  if (!url || !url.includes('/_next/static/')) return null;
  if (maps.has(url)) return maps.get(url);
  let c = null;
  try {
    const r = await fetch(`${url}.map`);
    if (r.ok) c = new sourceMap.SourceMapConsumer(await r.json());
  } catch { /* no map */ }
  maps.set(url, c);
  return c;
}
async function where(frame) {
  const m = await mapFor(frame.url);
  const short = (s) => s.replace(/^.*?(src\/|node_modules\/)/, '$1').replace(/^webpack:\/\/_N_E\//, '');
  if (!m) return { fn: frame.functionName || '(anon)', at: `${(frame.url || '(native)').replace(BASE, '').slice(-60)}:${frame.lineNumber + 1}` };
  const o = m.originalPositionFor({ line: frame.lineNumber + 1, column: Math.max(0, frame.columnNumber) });
  return { fn: o.name || frame.functionName || '(anon)', at: o.source ? `${short(o.source)}:${o.line}` : `${frame.url.slice(-40)}:${frame.lineNumber + 1}` };
}

/** Self and total time per function, the hot ones mapped to source. */
async function summarize(profile, top = 22) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const dt = new Map();
  for (let i = 0; i < profile.samples.length; i++) dt.set(profile.samples[i], (dt.get(profile.samples[i]) ?? 0) + (profile.timeDeltas[i + 1] ?? 0) / 1000);
  const key = (n) => `${n.callFrame.functionName}|${n.callFrame.url}|${n.callFrame.lineNumber}|${n.callFrame.columnNumber}`;
  const self = new Map(); const total = new Map(); const frames = new Map();
  for (const [id, ms] of dt) {
    const n = byId.get(id);
    const k = key(n);
    frames.set(k, n.callFrame);
    self.set(k, (self.get(k) ?? 0) + ms);
    const seen = new Set();
    for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
      const kk = key(byId.get(cur));
      if (seen.has(kk)) continue;
      seen.add(kk);
      frames.set(kk, byId.get(cur).callFrame);
      total.set(kk, (total.get(kk) ?? 0) + ms);
    }
  }
  const skip = /^\((root|program|idle|garbage collector)\)$/;
  const fmt = async (m) => {
    const rows = [];
    for (const [k, ms] of [...m.entries()].sort((a, b) => b[1] - a[1])) {
      const f = frames.get(k);
      if (rows.length >= top) break;
      const w = await where(f);
      rows.push({ ms: Math.round(ms), fn: w.fn, at: w.at });
    }
    return rows;
  };
  const gc = [...dt.entries()].filter(([id]) => byId.get(id).callFrame.functionName === '(garbage collector)').reduce((a, [, ms]) => a + ms, 0);
  const idle = [...dt.entries()].filter(([id]) => skip.test(byId.get(id).callFrame.functionName)).reduce((a, [, ms]) => a + ms, 0);
  const all = [...dt.values()].reduce((a, b) => a + b, 0);
  const selfRows = await fmt(new Map([...self].filter(([k]) => !skip.test(frames.get(k).functionName))));
  const totalRows = await fmt(new Map([...total].filter(([k]) => !skip.test(frames.get(k).functionName) && frames.get(k).url)));
  return { busyMs: Math.round(all - idle + gc), gcMs: Math.round(gc), self: selfRows, total: totalRows };
}

function monitor() {
  const m = { last: performance.now(), gaps: [], loafs: [] };
  window.__qaP = m;
  const beat = (now) => { if (!document.hidden) m.gaps.push(now - m.last); m.last = now; requestAnimationFrame(beat); };
  requestAnimationFrame(beat);
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.duration < 50) continue;
        m.loafs.push({ at: Math.round(e.startTime), ms: Math.round(e.duration), scripts: (e.scripts ?? []).slice(0, 5).map((s) => ({ ms: Math.round(s.duration), src: s.sourceURL, pos: s.sourceCharPosition, fn: s.sourceFunctionName, inv: (s.invoker || '').slice(0, 60) })) });
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch { /* none */ }
  // WebGL calls that cost the main thread: how many programs, and the time
  // blocked in the calls that wait on the GPU process.
  const gl = { compile: 0, link: 0, statusMs: 0, statusN: 0, uploadMs: 0, uploadMB: 0, uploads: 0, bigUploads: [], readMs: 0, draws: 0 };
  m.gl = gl;
  const timeIt = (proto, name, after) => {
    const f = proto?.[name];
    if (!f) return;
    proto[name] = function (...a) { const t = performance.now(); const r = f.apply(this, a); after(performance.now() - t, a, r); return r; };
  };
  for (const proto of [window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype]) {
    timeIt(proto, 'compileShader', () => { gl.compile++; });
    timeIt(proto, 'linkProgram', () => { gl.link++; });
    timeIt(proto, 'getProgramParameter', (ms) => { gl.statusMs += ms; gl.statusN++; });
    timeIt(proto, 'getShaderParameter', (ms) => { gl.statusMs += ms; gl.statusN++; });
    timeIt(proto, 'readPixels', (ms) => { gl.readMs += ms; });
    for (const n of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) timeIt(proto, n, () => { gl.draws++; });
    for (const n of ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'compressedTexImage2D']) {
      timeIt(proto, n, (ms, a) => {
        gl.uploadMs += ms; gl.uploads++;
        const src = a.find((x) => x && typeof x === 'object' && ('width' in x || 'byteLength' in x));
        const w = src?.width ?? (typeof a[3] === 'number' ? a[3] : 0); const h = src?.height ?? (typeof a[4] === 'number' ? a[4] : 0);
        gl.uploadMB += (w * h * 4) / 1048576;
        if (ms > 20) gl.bigUploads.push({ n, ms: Math.round(ms), w, h });
      });
    }
  }
  window.__qaPTake = () => {
    const g = m.gaps.slice().sort((a, b) => a - b); const sum = g.reduce((a, b) => a + b, 0);
    const q = (f) => (g.length ? Math.round(g[Math.min(g.length - 1, Math.floor(g.length * f))]) : 0);
    const out = { n: g.length, fps: sum ? +(g.length * 1000 / sum).toFixed(1) : 0, p50: q(0.5), p95: q(0.95), max: q(1), over50: g.filter((x) => x > 50).length, over100: g.filter((x) => x > 100).length, loafs: m.loafs };
    out.gl = { ...gl, drawsPerFrame: g.length ? Math.round(gl.draws / g.length) : 0, statusMs: Math.round(gl.statusMs), uploadMs: Math.round(gl.uploadMs), uploadMB: Math.round(gl.uploadMB), readMs: Math.round(gl.readMs), bigUploads: gl.bigUploads.sort((a, b) => b.ms - a.ms).slice(0, 6) };
    m.gaps = []; m.loafs = [];
    Object.assign(gl, { compile: 0, link: 0, statusMs: 0, statusN: 0, uploadMs: 0, uploadMB: 0, uploads: 0, bigUploads: [], readMs: 0, draws: 0 });
    return out;
  };
}

/** A chunk's character offset → line/column, for the LoAF script positions. */
const chunkText = new Map();
async function mapPos(url, pos) {
  if (!url || pos < 0) return null;
  if (!chunkText.has(url)) { try { chunkText.set(url, await (await fetch(url)).text()); } catch { chunkText.set(url, ''); } }
  const t = chunkText.get(url);
  if (!t) return null;
  let line = 0; let col = 0;
  for (let i = 0; i < pos && i < t.length; i++) { if (t.charCodeAt(i) === 10) { line++; col = 0; } else col++; }
  return where({ url, lineNumber: line, columnNumber: col, functionName: '' });
}

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--ignore-gpu-blocklist', '--enable-precise-memory-info', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const ctx = await browser.newContext(phone ? { ...devices['Pixel 7'], deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await ctx.addInitScript(monitor);
if (QUALITY) await ctx.addInitScript((q) => { try { localStorage.setItem('stellar_explore_settings', JSON.stringify({ v: 1, quality: q })); } catch { /* none */ } }, QUALITY);
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });
const cdp = await ctx.newCDPSession(p);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
await cdp.send('Performance.enable');
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
const heap = async () => { const { metrics } = await cdp.send('Performance.getMetrics'); return Math.round(metrics.find((x) => x.name === 'JSHeapUsedSize').value / 1048576); };
const wait = (ms) => p.waitForTimeout(ms);
async function until(fn, s, a) { const end = Date.now() + s * 1000; while (Date.now() < end) { if (await p.evaluate(fn, a).catch(() => false)) return true; await wait(200); } return false; }
const surf = () => window.__stellarWorld ?? window.__stellarMoon ?? null;

const report = { site: SITE, profile: PROFILE, cpu: CPU, quality: QUALITY, phases: [] };
async function phase(name, body) {
  if (!PHASES.includes(name) && !['boot'].includes(name)) { await body(); return; }
  await p.evaluate(() => window.__qaPTake?.());
  const h0 = await heap();
  await cdp.send('Profiler.start');
  const t0 = Date.now();
  let detail = {};
  try { detail = (await body()) ?? {}; } catch (e) { detail = { error: e.message.split('\n')[0] }; }
  const { profile } = await cdp.send('Profiler.stop');
  const secs = (Date.now() - t0) / 1000;
  const fr = await p.evaluate(() => window.__qaPTake?.());
  const h1 = await heap();
  writeFileSync(`${OUT}${name}.cpuprofile`, JSON.stringify(profile));
  const sum = await summarize(profile);
  const loafs = [];
  for (const l of fr.loafs.sort((a, b) => b.ms - a.ms).slice(0, 12)) {
    const scripts = [];
    for (const s of l.scripts) { const w = await mapPos(s.src, s.pos); scripts.push(`${w ? `${w.fn} ${w.at}` : (s.fn || s.inv || '?')} ${s.ms}ms`); }
    loafs.push({ ms: l.ms, at: l.at, scripts });
  }
  const rec = { name, gl: fr.gl, secs: +secs.toFixed(1), fps: fr.fps, p50: fr.p50, p95: fr.p95, max: fr.max, over50: fr.over50, over100: fr.over100, heapMB: [h0, h1], busyMs: sum.busyMs, gcMs: sum.gcMs, loafs, self: sum.self, total: sum.total, ...detail };
  report.phases.push(rec);
  say(`\n## ${name}  ${rec.secs}s  ${rec.fps} fps  p50 ${rec.p50} p95 ${rec.p95} max ${rec.max} ms  >50:${rec.over50} >100:${rec.over100}  heap ${h0}→${h1} MB  busy ${rec.busyMs} ms (gc ${rec.gcMs})  ${JSON.stringify(detail)}`);
  say(`  gl: ${fr.gl.drawsPerFrame} draws/frame; ${fr.gl.link} programs linked (${fr.gl.compile} shaders), ${fr.gl.statusMs} ms blocked in ${fr.gl.statusN} status checks; ${fr.gl.uploads} uploads, ${fr.gl.uploadMB} MB, ${fr.gl.uploadMs} ms; readPixels ${fr.gl.readMs} ms; big: ${fr.gl.bigUploads.map((b) => `${b.n} ${b.w}x${b.h} ${b.ms}ms`).join(', ')}`);
  say('  longest frames:'); for (const l of loafs.slice(0, 8)) say(`    ${l.ms} ms @${l.at}: ${l.scripts.join(' | ')}`);
  say('  self:'); for (const r of sum.self.slice(0, 16)) say(`    ${String(r.ms).padStart(6)} ms  ${r.fn}  ${r.at}`);
  say('  total:'); for (const r of sum.total.slice(0, 16)) say(`    ${String(r.ms).padStart(6)} ms  ${r.fn}  ${r.at}`);
}

const fly = async (thrust, yaw = 0) => {
  if (phone) { await p.evaluate(([t, y]) => { const f = window.__stellarFlight; if (f) { f.session.input.thrust = t; f.session.input.yaw = y; } }, [thrust, yaw]); return; }
  for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) await p.keyboard.up(k);
  if (thrust > 0) await p.keyboard.down('KeyW');
  if (yaw > 0) await p.keyboard.down('KeyD');
  if (yaw < 0) await p.keyboard.down('KeyA');
};

await phase('boot', async () => {
  const t = Date.now();
  await p.goto(`${BASE}/play`, { waitUntil: 'domcontentloaded' });
  if (!(await until(() => !!document.querySelector('.game-mode[data-mode="free"]'), 180))) throw new Error('no title');
  await p.click('.game-mode[data-mode="free"]');
  if (!(await until(() => !!window.__stellarFlight?.session.active && !window.__stellarFlight.session.paused && !document.querySelector('.flight-hud__launching:not(.is-done)'), 300))) throw new Error('never flying');
  return { toFlyingS: +((Date.now() - t) / 1000).toFixed(1), quality: await p.evaluate(() => window.__stellarGame?.quality?.() ?? null).catch(() => null) };
});


await phase('cruise', async () => {
  await fly(1); await wait(5000); await fly(1, 1); await wait(4000); await fly(1, -1); await wait(4000); await fly(0); await wait(2000);
});

let reached = false;
await phase('approach', async () => {
  await p.evaluate((id) => {
    const f = window.__stellarFlight; const b = f.world.bodies.find((x) => x.id === id);
    const out = (b.radius * 3) / Math.SQRT2;
    f.ship.spawn({ position: { x: b.position.x + out, y: b.position.y + out * 0.08, z: b.position.z + out }, lookAt: b.position, yaw: 0 });
  }, SITE);
  await wait(500);
  await p.evaluate(() => { window.__stellarFlight.session.input.modeRequest = 'fast'; });
  await fly(1);
  const t = Date.now();
  let loader = 0;
  let shot = 0;
  while (Date.now() - t < 240_000) {
    const s = await p.evaluate(() => ({ g: window.__stellarGame.get(), loader: [...document.querySelectorAll('.cosmic-loader')].some((el) => !el.classList.contains('is-done') && getComputedStyle(el).visibility !== 'hidden' && Number(getComputedStyle(el).opacity) > 0.05 && (!el.closest('.game-world__surface') || el.closest('.game-world__surface').dataset.shown === 'true')) }));
    if (s.loader) loader++;
    if (SHOTS && shot++ % 6 === 0) await p.screenshot({ path: `${OUT}approach-${String(shot).padStart(3, '0')}-${s.g.scene}-${s.g.state}.jpg`, type: 'jpeg', quality: 60 }).catch(() => {});
    if (s.g.scene === SITE && s.g.state === 'playing') { reached = true; break; }
    if (phone) await fly(1);
    await wait(250);
  }
  await fly(0);
  return { reached, toSurfaceS: +((Date.now() - t) / 1000).toFixed(1), loaderSamples: loader };
});

if (reached) {
  await phase('land', async () => {
    const t = Date.now();
    // A dive: the computer has the descent already; the key is the other way in.
    const legs = [];
    let last = '';
    let ok = false;
    while (Date.now() - t < 240_000) {
      const w = await p.evaluate(() => { const x = (window.__stellarWorld ?? window.__stellarMoon); return x ? { p: x.telemetry.phase, o: x.telemetry.orbital?.phase ?? '', auto: x.telemetry.autoland, exit: !!x.telemetry.exitReady } : null; }).catch(() => null);
      if (w) {
        const k = `${w.p}/${w.o}${w.auto ? '+auto' : ''}`;
        if (k !== last) { legs.push(`${((Date.now() - t) / 1000).toFixed(1)}s ${k}`); last = k; }
        if (w.p === 'surface' || w.exit) { ok = true; break; }
      }
      await wait(250);
    }
    return { touchdownS: ok ? +((Date.now() - t) / 1000).toFixed(1) : null, legs };
  });
  await phase('walk', async () => {
    await p.evaluate(() => { const w = (window.__stellarWorld ?? window.__stellarMoon); if (w) w.input.interact = true; });
    await until(() => (window.__stellarWorld ?? window.__stellarMoon)?.telemetry.phase === 'surface', 60);
    await wait(2000);
    await p.keyboard.down('KeyW'); await wait(4000); await p.keyboard.up('KeyW');
    // The jetpack: hold, let go, and see the flame go out.
    await p.keyboard.down('Space'); await wait(2500);
    const lit = await p.evaluate(() => (window.__stellarWorld ?? window.__stellarMoon)?.telemetry.jetting ?? null);
    await p.keyboard.up('Space');
    const out = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; const w = (window.__stellarWorld ?? window.__stellarMoon); if (!w?.telemetry.jetting || n > 30) res({ frames: n, ms: Math.round(performance.now() - t0) }); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
    await wait(3000);
    return { jetLit: lit, jetOutAfter: out };
  });
  await phase('ascent', async () => {
    const t = Date.now();
    await p.evaluate(() => (window.__stellarWorld ?? window.__stellarMoon)?.forceInteract('boardLander', 2));
    const ok = await until(() => { const g = window.__stellarGame.get(); return g.scene === 'orbit' && g.state === 'playing' && !!window.__stellarFlight?.session.active; }, 600);
    return { toOrbitS: ok ? +((Date.now() - t) / 1000).toFixed(1) : null };
  });
}
report.errors = errors.filter((e) => !/privy|walletconnect|Failed to fetch|NetworkError/i.test(e));
say(`\nerrors: ${report.errors.length ? report.errors.slice(0, 8).join('\n  ') : 'none'}`);
writeFileSync(`${OUT}report.json`, JSON.stringify(report, null, 2));
await browser.close();
