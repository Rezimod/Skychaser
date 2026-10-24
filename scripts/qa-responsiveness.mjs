// Responsiveness QA: the whole game, played end to end, with everything that
// makes a game feel frozen or restart watched the whole time.
//
//   node scripts/qa-responsiveness.mjs [--url http://localhost:3000] [--out dir]
//        [--profiles desktop,phone] [--sites earth,mars,moon] [--cycles 1]
//
// Needs the test hooks: a dev server, or a production build made with
// NEXT_PUBLIC_GAME_QA=1 (the real thing, and what this is meant for).
//
// Per profile (a desktop, and a phone with touch) it plays:
//   boot      the title screen → Free Fly → the ship flying
//   cruise    throttle, turns, the speed modes, the menu open and shut
//   approach  from three radii out, fly at a world: the ship should slow on
//             its own; dive into the air and the surface takes over with no
//             loading screen
//   descent   the entry and the powered descent, to the pad at the base
//   surface   out of the ship, walk, fly the jetpack, go back to the base
//   lifecycle the tab frozen and thawed (a phone locked and unlocked), the
//             screen turned (phone) — the game must carry on
//   ascent    board, climb back to orbit
// and repeats the landing on each site, so anything that grows per landing
// (memory, listeners, GPU contexts) shows up between cycles.
//
// Watched throughout, from an init script that runs before the game:
//   - the game's own frames (WebGL clears per canvas): a picture that stops
//     while the page is still alive is a freeze
//   - the main thread (a rAF heartbeat, long tasks, long animation frames
//     with the scripts that caused them)
//   - page errors, unhandled rejections, GPU context losses, renderer
//     crashes, reloads
//   - the JS heap, DOM nodes and event listeners (CDP), per phase
// It writes report.json and report.md, and exits 1 on any hard failure.
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('url', 'http://localhost:3000');
const OUT = `${arg('out', './qa-responsiveness')}/`;
const PROFILES = arg('profiles', 'desktop,phone').split(',').filter(Boolean);
const SITES = arg('sites', 'earth,mars,moon').split(',').filter(Boolean);
const CYCLES = Number(arg('cycles', '1'));
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'];
mkdirSync(OUT, { recursive: true });

/** Software GL draws a few frames a second, so a "stall" here is long. */
const STALL_MS = Number(arg('stall', '6000'));

const say = (m) => console.log(m);

// ── The monitor, installed before any page script. ──
function monitor() {
  const m = {
    t0: performance.now(),
    beats: 0, maxGap: 0, gaps250: 0, gaps1000: 0, lastBeat: performance.now(),
    longTasks: [], loafs: [], errors: [], contextsMade: 0, contextsLost: 0,
    clears: new Map(), canvasIds: new WeakMap(), nextCanvas: 1, labels: new Map(), contexts: [],
  };
  window.__qaMon = m;
  const beat = (now) => {
    const gap = now - m.lastBeat;
    if (gap > m.maxGap) m.maxGap = gap;
    if (gap > 250) m.gaps250++;
    if (gap > 1000) m.gaps1000++;
    m.lastBeat = now;
    m.beats++;
    requestAnimationFrame(beat);
  };
  requestAnimationFrame(beat);
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) m.longTasks.push({ at: Math.round(e.startTime), ms: Math.round(e.duration) });
      if (m.longTasks.length > 4000) m.longTasks.splice(0, 1000);
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* not supported */ }
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.duration < 120) continue;
        m.loafs.push({
          at: Math.round(e.startTime), ms: Math.round(e.duration), block: Math.round(e.blockingDuration ?? 0),
          scripts: (e.scripts ?? []).slice(0, 4).map((s) => ({
            ms: Math.round(s.duration), fn: s.sourceFunctionName || '', src: (s.sourceURL || '').replace(location.origin, '').slice(-90),
            pos: s.sourceCharPosition ?? -1, invoker: (s.invoker || '').slice(0, 80),
          })),
        });
        if (m.loafs.length > 1500) m.loafs.splice(0, 500);
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch { /* not supported */ }
  addEventListener('error', (e) => m.errors.push(`error: ${e.message} @ ${(e.filename || '').replace(location.origin, '')}:${e.lineno}`));
  addEventListener('unhandledrejection', (e) => m.errors.push(`rejection: ${String(e.reason?.stack || e.reason).slice(0, 300)}`));
  addEventListener('webglcontextlost', () => { m.contextsLost++; }, true);
  const labelOf = (c) => {
    const host = c.closest('.game-world__surface') ? 'surface' : c.closest('.moon-surface') ? 'surface' : 'flight';
    return host;
  };
  const wrap = (proto) => {
    if (!proto) return;
    const clear = proto.clear;
    proto.clear = function (bits) {
      const c = this.canvas;
      let id = m.canvasIds.get(c);
      if (!id) { id = m.nextCanvas++; m.canvasIds.set(c, id); }
      m.clears.set(id, (m.clears.get(id) || 0) + 1);
      if (c.isConnected) m.labels.set(id, labelOf(c));
      return clear.call(this, bits);
    };
  };
  wrap(window.WebGLRenderingContext?.prototype);
  wrap(window.WebGL2RenderingContext?.prototype);
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const had = this.__qaHadContext;
    const ctx = getContext.call(this, type, ...rest);
    if (ctx && !had && /webgl/.test(String(type))) {
      this.__qaHadContext = true;
      m.contextsMade++;
      m.contexts.push(typeof WeakRef === 'function' ? new WeakRef(ctx) : { deref: () => ctx });
    }
    return ctx;
  };
  window.__qaSnap = () => ({
    beats: m.beats, maxGap: Math.round(m.maxGap), gaps250: m.gaps250, gaps1000: m.gaps1000,
    longTasks: m.longTasks.length, longMs: m.longTasks.reduce((a, e) => a + e.ms, 0), worstLong: m.longTasks.reduce((a, e) => Math.max(a, e.ms), 0),
    errors: m.errors.slice(), contextsMade: m.contextsMade, contextsLost: m.contextsLost,
    // Asked of each context itself: a lost one (given back, or taken by the
    // GPU) is not counted, wherever its canvas is; a live one is, even off
    // the page, because it still holds its memory.
    contextsAlive: m.contexts.reduce((n, r) => { const c = r.deref(); return n + (c && !c.isContextLost() ? 1 : 0); }, 0),
    clears: [...m.clears.entries()].map(([id, n]) => ({ id, n, label: m.labels.get(id) || '?' })),
    loafs: m.loafs.length,
  });
  window.__qaSurface = () => window.__stellarWorld ?? window.__stellarMoon ?? null;
  window.__qaResetGap = () => { m.maxGap = 0; };
  window.__qaLoafs = (since) => m.loafs.filter((e) => e.at >= since);
  window.__qaLong = (since) => m.longTasks.filter((e) => e.at >= since);
}

// ── Helpers. ──
const wait = (p, ms) => p.waitForTimeout(ms);
async function until(p, fn, s, a) {
  const end = Date.now() + s * 1000;
  while (Date.now() < end) {
    if (await p.evaluate(fn, a).catch(() => false)) return true;
    await wait(p, 250);
  }
  return false;
}
const gameState = (p) => p.evaluate(() => window.__stellarGame?.get() ?? null).catch(() => null);
const surfaceHook = '(window.__stellarWorld ?? window.__stellarMoon)';

async function cdpMetrics(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const o = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  return { heapMB: Math.round(o.JSHeapUsedSize / 1048576), nodes: o.Nodes, listeners: o.JSEventListeners, docs: o.Documents, frames: o.Frames };
}

/** One run in one browser context: the phases, each measured. */
async function play(browser, profile) {
  const phone = profile === 'phone';
  const ctx = await browser.newContext(phone
    ? { ...devices['Pixel 7'], deviceScaleFactor: 1 }
    : { viewport: { width: 1100, height: 620 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(monitor);
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Performance.enable');
  const run = { profile, phases: [], failures: [], notes: [] };
  const fail = (m) => { run.failures.push(m); say(`  FAIL [${profile}] ${m}`); };
  const note = (m) => { run.notes.push(m); say(`  note [${profile}] ${m}`); };
  let loads = 0;
  let crashed = false;
  const pageErrors = [];
  p.on('load', () => { loads++; });
  p.on('crash', () => { crashed = true; fail('the renderer crashed (a phone would show this as the game restarting)'); });
  p.on('pageerror', (e) => { if (!/privy|walletconnect|Failed to fetch|NetworkError|Load failed/i.test(e.message)) pageErrors.push(e.message.slice(0, 300)); });
  p.on('console', (msg) => { if (msg.type() === 'error' && /THREE|WebGL|GL_|shader/i.test(msg.text())) pageErrors.push(`console: ${msg.text().slice(0, 300)}`); });

  // The game's frames: sampled from here, so a stalled loop shows as a flat line.
  let sampler = null;
  let stallNow = 0;
  let worstStall = 0;
  let lastClears = -1;
  let lastAdvance = Date.now();
  const frameLog = [];
  const startSampler = () => {
    sampler = setInterval(async () => {
      if (crashed) return;
      const s = await p.evaluate(() => {
        const g = window.__stellarGame?.get();
        const snap = window.__qaSnap?.();
        const veil = !!document.querySelector('.game-world__veil');
        return snap && { n: snap.clears.reduce((a, c) => a + c.n, 0), state: g?.state, scene: g?.scene, overlay: g?.overlay ?? null, veil, hidden: document.hidden };
      }).catch(() => null);
      if (!s) return;
      const now = Date.now();
      // Only a playing, unpaused, visible game is expected to draw.
      const expected = s.state === 'playing' && !s.hidden;
      if (s.n !== lastClears || !expected) { lastAdvance = now; lastClears = s.n; stallNow = 0; }
      else {
        stallNow = now - lastAdvance;
        if (stallNow > worstStall) worstStall = stallNow;
      }
      frameLog.push({ at: now, n: s.n, state: s.state, scene: s.scene });
      if (frameLog.length > 5000) frameLog.shift();
    }, 400);
  };

  async function phase(name, body) {
    if (crashed) return;
    const t0 = Date.now();
    const pageT0 = await p.evaluate(() => performance.now()).catch(() => 0);
    await p.evaluate(() => window.__qaResetGap?.()).catch(() => {});
    const before = await p.evaluate(() => window.__qaSnap?.()).catch(() => null);
    const m0 = await cdpMetrics(cdp).catch(() => null);
    const n0 = lastClears;
    worstStall = 0;
    const errorsBefore = pageErrors.length;
    let ok = true;
    let detail = {};
    try {
      detail = (await body()) ?? {};
    } catch (e) {
      ok = false;
      fail(`${name}: ${e.message.split('\n')[0]}`);
    }
    if (crashed) return;
    const after = await p.evaluate(() => window.__qaSnap?.()).catch(() => null);
    const m1 = await cdpMetrics(cdp).catch(() => null);
    const loafs = await p.evaluate((since) => window.__qaLoafs?.(since) ?? [], pageT0).catch(() => []);
    const longs = await p.evaluate((since) => window.__qaLong?.(since) ?? [], pageT0).catch(() => []);
    const secs = (Date.now() - t0) / 1000;
    const frames = lastClears - n0;
    const rec = {
      name, ok, secs: +secs.toFixed(1),
      gameFrames: frames, gameFps: +(frames / secs).toFixed(2),
      worstStallMs: worstStall,
      mainThread: after && before ? {
        maxGapMs: after.maxGap, gaps1s: after.gaps1000 - before.gaps1000,
        longTasks: longs.length, longTaskMs: longs.reduce((a, e) => a + e.ms, 0), worstLongMs: longs.reduce((a, e) => Math.max(a, e.ms), 0),
      } : null,
      worstFrames: loafs.sort((a, b) => b.ms - a.ms).slice(0, 5),
      contexts: after ? { made: after.contextsMade, lost: after.contextsLost, alive: after.contextsAlive } : null,
      memory: m0 && m1 ? { heapMB: [m0.heapMB, m1.heapMB], nodes: [m0.nodes, m1.nodes], listeners: [m0.listeners, m1.listeners] } : null,
      // The sign-in service is not configured in a local build (production has its key).
      errors: pageErrors.slice(errorsBefore).concat((after?.errors ?? []).slice(before?.errors.length ?? 0)).filter((e) => !/PRIVY|privy|walletconnect/.test(e)),
      ...detail,
    };
    run.phases.push(rec);
    say(`  ${name.padEnd(22)} ${String(rec.secs).padStart(6)} s  frames ${String(frames).padStart(5)} (${rec.gameFps}/s)  stall ${worstStall} ms  longest task ${rec.mainThread?.worstLongMs ?? '?'} ms  heap ${rec.memory?.heapMB.join('→') ?? '?'} MB  listeners ${rec.memory?.listeners.join('→') ?? '?'}  contexts alive ${rec.contexts?.alive ?? '?'}`);
    if (rec.errors.length) fail(`${name}: errors: ${rec.errors.slice(0, 3).join(' | ')}`);
    if (worstStall > STALL_MS) fail(`${name}: the picture stopped for ${(worstStall / 1000).toFixed(1)} s while the game was playing`);
    if (rec.contexts && rec.contexts.alive > 2) fail(`${name}: ${rec.contexts.alive} WebGL contexts alive at once`);
    if (loads > 1) fail(`${name}: the page reloaded (${loads - 1})`);
  }

  // The throttle and the stick: the keyboard on a desktop, the touch stick's values on a phone.
  const fly = async (thrust, yaw = 0) => {
    if (phone) {
      await p.evaluate(([t, y]) => { const f = window.__stellarFlight; if (f) { f.session.input.thrust = t; f.session.input.yaw = y; } }, [thrust, yaw]);
    } else {
      for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) await p.keyboard.up(k);
      if (thrust > 0) await p.keyboard.down('KeyW');
      if (thrust < 0) await p.keyboard.down('KeyS');
      if (yaw > 0) await p.keyboard.down('KeyD');
      if (yaw < 0) await p.keyboard.down('KeyA');
    }
  };

  startSampler();
  await phase('boot', async () => {
    const t = Date.now();
    await p.goto(`${BASE}/play`, { waitUntil: 'domcontentloaded' });
    if (!(await until(p, () => !!document.querySelector('.game-mode[data-mode="free"]'), 180))) throw new Error('no title screen');
    const title = (Date.now() - t) / 1000;
    await p.click('.game-mode[data-mode="free"]');
    if (!(await until(p, () => !!window.__stellarFlight?.session.active && !window.__stellarFlight.session.paused && !document.querySelector('.flight-hud__launching:not(.is-done)'), 300))) throw new Error('never got to the flying ship');
    return { titleS: +title.toFixed(1), toFlyingS: +((Date.now() - t) / 1000).toFixed(1) };
  });

  await phase('cruise', async () => {
    // Input to motion: how many seconds from the throttle to the ship moving.
    const v0 = await p.evaluate(() => window.__stellarFlight.session.telemetry.speed);
    const t = Date.now();
    await fly(1);
    let reactS = null;
    if (await until(p, (v) => window.__stellarFlight.session.telemetry.speed > v + 1e-4, 30, v0)) reactS = (Date.now() - t) / 1000;
    else fail('cruise: the ship did not answer the throttle in 30 s');
    await wait(p, 4000);
    await fly(1, 1); await wait(p, 3000);
    await fly(1, -1); await wait(p, 3000);
    await p.evaluate(() => { window.__stellarFlight.session.input.modeRequest = 'fast'; });
    await wait(p, 3000);
    await p.evaluate(() => { window.__stellarFlight.session.input.modeRequest = 'cruise'; });
    await fly(0); await wait(p, 1500);
    // The pause menu, in and out.
    await p.evaluate(() => window.__stellarGame.pause());
    await wait(p, 1200);
    await p.evaluate(() => window.__stellarGame.resume());
    if (!(await until(p, () => window.__stellarGame.get().state === 'playing', 20))) fail('cruise: did not come back from pause');
    await wait(p, 1500);
    const finite = await p.evaluate(() => { const s = window.__stellarFlight.ship; const q = s?.group?.position ?? s?.position; return !q || [q.x, q.y, q.z].every(Number.isFinite); });
    if (!finite) fail('cruise: the ship position is not a number');
    return { throttleToMotionS: reactS };
  });

  for (let cycle = 0; cycle < CYCLES; cycle++) {
    for (const site of SITES) {
      const tag = `${site}${CYCLES > 1 ? `#${cycle + 1}` : ''}`;
      let reached = false;
      await phase(`approach ${tag}`, async () => {
        // Three radii out from the world's centre, nose at it.
        const placed = await p.evaluate((id) => {
          const f = window.__stellarFlight;
          const b = f.world.bodies.find((x) => x.id === id);
          if (!b) return false;
          const out = (b.radius * 3) / Math.SQRT2;
          f.ship.spawn({ position: { x: b.position.x + out, y: b.position.y + out * 0.08, z: b.position.z + out }, lookAt: b.position, yaw: 0 });
          return true;
        }, site);
        if (!placed) throw new Error(`no ${site} in the flight world`);
        await wait(p, 800);
        await p.evaluate(() => { window.__stellarFlight.session.input.modeRequest = 'fast'; });
        await fly(1);
        const speeds = [];
        let loader = 0;
        let veil = 0;
        let still = 0;
        let plain = 0;
        const t = Date.now();
        while (Date.now() - t < 300_000) {
          const s = await p.evaluate((sel) => {
            const f = window.__stellarFlight;
            const g = window.__stellarGame.get();
            const loaderUp = [...document.querySelectorAll('.cosmic-loader')].some((el) => {
              if (el.classList.contains('is-done')) return false;
              const cs = getComputedStyle(el);
              if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) return false;
              const wrap = el.closest('.game-world__surface');
              return !wrap || wrap.dataset.shown === 'true';
            });
            return { scene: g.scene, state: g.state, loaderUp, veil: !!document.querySelector('.game-world__veil'), still: !!document.querySelector('.game-world__veil[data-still="true"] canvas'), plainVeil: !!document.querySelector('.game-world__veil[data-still="false"][data-waiting="false"]'),
              alt: f?.session.telemetry.nearAltKm ?? null, near: f?.session.telemetry.nearId ?? '', kms: f?.session.telemetry.speedKmS ?? null, mode: f?.session.telemetry.mode ?? '',
              phase: window.__qaSurface()?.telemetry.phase ?? null };
          }, surfaceHook);
          if (s.loaderUp) loader++;
          if (s.veil) veil++;
          if (s.still) still++;
          if (s.plainVeil) plain++;
          if (s.near === site && s.alt !== null && s.scene === 'orbit') speeds.push({ alt: Math.round(s.alt), kms: +(+s.kms).toFixed(2), mode: s.mode });
          if (s.scene === site && s.state === 'playing') { reached = true; break; }
          if (phone) await fly(1);
          await wait(p, 300);
        }
        await fly(0);
        if (!reached) throw new Error(`never reached the ${site} surface`);
        if (loader) fail(`approach ${tag}: a loading screen showed on ${loader} samples`);
        // The slow-down: close in, the ship should be far slower than out in space.
        const far = speeds.filter((x) => x.alt > 0).slice(0, 3);
        const close = speeds.slice(-3);
        const startPhase = await p.evaluate((sel) => ({ p: window.__qaSurface()?.telemetry.phase, o: window.__qaSurface()?.telemetry.orbital?.phase ?? '' }), surfaceHook);
        // The handover carries the last real frame, not a screen of its own.
        if (veil && !still) fail(`approach ${tag}: the handover showed a plain veil, not the last frame`);
        return { loaderSamples: loader, veilSamples: veil, stillSamples: still, plainVeilSamples: plain, speedFar: far, speedClose: close, surfaceStartsAt: `${startPhase.p}/${startPhase.o}`, diveS: +((Date.now() - t) / 1000).toFixed(1) };
      });
      if (!reached) continue;

      await phase(`flight ${tag}`, async () => {
        // Through the plasma the ship is the pilot's: fly it, then hand it to the computer for the base.
        if (!(await until(p, () => window.__qaSurface()?.telemetry.freeFlight === true, 180))) {
          note(`flight ${tag}: no free flight (not a dive, or the entry ran long under software GL)`);
          return {};
        }
        const at = async () => p.evaluate(() => { const o = window.__qaSurface()?.telemetry.orbital; return o ? { alt: Math.round(o.altitude), spd: Math.round(o.speed), km: +o.downrangeKm.toFixed(2) } : null; });
        const a0 = await at();
        await p.keyboard.down('KeyW'); await wait(p, 4000); await p.keyboard.up('KeyW');
        await p.keyboard.down('KeyD'); await wait(p, 2500); await p.keyboard.up('KeyD');
        await p.keyboard.down('Space'); await wait(p, 2000); await p.keyboard.up('Space');
        const a1 = await at();
        await p.screenshot({ path: `${OUT}${profile}-${tag}-flight.png` }).catch(() => {});
        const finite = await p.evaluate(() => { const o = window.__qaSurface()?.telemetry.orbital; return !!o && Number.isFinite(o.altitude + o.speed); });
        if (!finite) fail(`flight ${tag}: the flight numbers went bad`);
        if (a0 && a1 && a0.km === a1.km && a0.alt === a1.alt) fail(`flight ${tag}: the ship did not move under the pilot's keys`);
        // Land at base: the computer takes it to the pad and the lander's guidance down.
        const key = await p.$('[data-action="autoland"]');
        let handed = null;
        if (key && await key.isVisible().catch(() => false)) {
          const t = Date.now();
          await key.click().catch(() => {});
          if (await until(p, () => { const w = window.__qaSurface(); return !!w && !w.telemetry.freeFlight && w.telemetry.phase !== 'orbit'; }, 240)) handed = (Date.now() - t) / 1000;
          else note(`flight ${tag}: the computer had not reached the pad in 240 s of software GL`);
        } else fail(`flight ${tag}: no Land at base key in free flight`);
        return { before: a0, after: a1, toPadS: handed };
      });

      await phase(`descent ${tag}`, async () => {
        await wait(p, 12000);
        await p.evaluate(() => window.__qaSurface()?.skipOrbit());
        // The powered descent: the flight from orbit hands over to the lander.
        if (!(await until(p, () => window.__qaSurface()?.telemetry.phase === 'descent', 90))) note(`descent ${tag}: still not in the powered descent 90 s after the skip`);
        await wait(p, 1500);
        await p.screenshot({ path: `${OUT}${profile}-${tag}-powered.png` }).catch(() => {});
        // The landing computer: the deck's key takes the ship down onto the pad.
        let autoland = null;
        // After a dive the computer already has the descent; otherwise the key hands it over.
        const already = await p.evaluate(() => window.__qaSurface()?.telemetry.autoland === true);
        const key = await p.$('[data-action="autoland"]');
        if (already || (key && await key.isVisible().catch(() => false))) {
          const t = Date.now();
          if (!already) await key.click().catch(() => {});
          const flying = await until(p, () => window.__qaSurface()?.telemetry.autoland === true, 20);
          if (!flying) fail(`descent ${tag}: the land-at-base key did not hand the descent to the computer`);
          if (await until(p, () => { const w = window.__qaSurface(); return w?.telemetry.phase === 'touchdown' || w?.telemetry.phase === 'surface'; }, 240)) autoland = (Date.now() - t) / 1000;
          else note(`descent ${tag}: the computer had not landed in 240 s of software GL; skipping to the ground`);
        } else fail(`descent ${tag}: no land-at-base key during the powered descent`);
        if (autoland === null) await p.evaluate(() => window.__qaSurface()?.skipDescent());
        if (!(await until(p, (sel) => { const w = window.__qaSurface(); return w?.telemetry.phase === 'surface' || w?.telemetry.exitReady; }, 180, surfaceHook))) throw new Error('never touched down');
        await wait(p, 2000);
        await p.screenshot({ path: `${OUT}${profile}-${tag}-parked.png` }).catch(() => {});
        const off = await p.evaluate(() => { const w = window.__qaSurface(); return w?.telemetry.landing ? Math.round(w.telemetry.landing.offset ?? -1) : null; }).catch(() => null);
        return { autolandS: autoland, offPadM: off };
      });

      await phase(`surface ${tag}`, async () => {
        await p.evaluate((sel) => { const w = window.__qaSurface(); if (w) w.input.interact = true; }, surfaceHook);
        await until(p, (sel) => window.__qaSurface()?.telemetry.phase === 'surface', 60, surfaceHook);
        await wait(p, 3000);
        const start = await p.evaluate((sel) => window.__qaSurface()?.where(), surfaceHook);
        if (phone) {
          await p.evaluate((sel) => { const w = window.__qaSurface(); if (w) { w.input.moveY = 1; } }, surfaceHook);
          await wait(p, 5000);
          await p.evaluate((sel) => { const w = window.__qaSurface(); if (w) { w.input.moveY = 0; } }, surfaceHook);
        } else {
          await p.keyboard.down('KeyW'); await wait(p, 5000); await p.keyboard.up('KeyW');
          await p.keyboard.down('Space'); await wait(p, 2500); await p.keyboard.up('Space');
          await wait(p, 3000);
        }
        const end = await p.evaluate((sel) => window.__qaSurface()?.where(), surfaceHook);
        const finite = !!end && [end.x, end.y, end.z].every(Number.isFinite);
        if (!finite) fail(`surface ${tag}: the crew's position is not a number`);
        // The way back to the base: the deck's key, if this build has it.
        // Far from the ship (as after a long walk or a flight), the key comes up.
        await p.evaluate((st) => { const w = window.__qaSurface(); if (w && st) w.teleport(st.x + 90, st.z + 20); }, start);
        await until(p, () => { const k = document.querySelector('[data-action="go-base"]'); return !!k && getComputedStyle(k).display !== 'none'; }, 15);
        const baseKey = await p.$('[data-action="go-base"]');
        let baseS = null;
        if (baseKey && await baseKey.isVisible().catch(() => false)) {
          const t = Date.now();
          await baseKey.click().catch(() => {});
          if (await until(p, (sel) => { const w = window.__qaSurface(); return w && w.telemetry.baseDistance !== undefined && w.telemetry.baseDistance < 30; }, 120, surfaceHook)) baseS = (Date.now() - t) / 1000;
          else fail(`surface ${tag}: the go-to-base key did not bring the crew to the base`);
        } else fail(`surface ${tag}: no back-to-base key with the crew 90 m from the ship`);
        await p.screenshot({ path: `${OUT}${profile}-${tag}-surface.png` }).catch(() => {});
        const moved = start && end ? Math.hypot(end.x - start.x, end.z - start.z) : 0;
        return { walkedM: +moved.toFixed(1), goBaseS: baseS };
      });

      await phase(`lifecycle ${tag}`, async () => {
        // A phone locked and unlocked: the page frozen, then thawed.
        await cdp.send('Page.setWebLifecycleState', { state: 'frozen' }).catch(() => {});
        await wait(p, 5000);
        await cdp.send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
        await wait(p, 4000);
        if (phone) {
          await p.setViewportSize({ width: 915, height: 412 }); await wait(p, 3000);
          await p.screenshot({ path: `${OUT}${profile}-${tag}-landscape.png` }).catch(() => {});
          await p.setViewportSize({ width: 412, height: 915 }); await wait(p, 3000);
        } else {
          await p.setViewportSize({ width: 800, height: 600 }); await wait(p, 2000);
          await p.setViewportSize({ width: 1100, height: 620 }); await wait(p, 2000);
        }
        const finite = await p.evaluate((sel) => { const w = window.__qaSurface()?.where(); return !!w && [w.x, w.y, w.z].every(Number.isFinite); }, surfaceHook);
        if (!finite) fail(`lifecycle ${tag}: the crew's position went bad after the tab was frozen`);
        const g = await gameState(p);
        if (g?.state !== 'playing') fail(`lifecycle ${tag}: state ${g?.state} after thawing`);
      });

      await phase(`ascent ${tag}`, async () => {
        const boarded = await p.evaluate((sel) => window.__qaSurface()?.forceInteract('boardLander', 2) ?? false, surfaceHook);
        if (!boarded) throw new Error('could not board the lander');
        if (!(await until(p, () => { const g = window.__stellarGame.get(); return g.scene === 'orbit' && g.state === 'playing' && !!window.__stellarFlight?.session.active; }, 900))) throw new Error('never got back to the ship in orbit');
        await wait(p, 3000);
      });
    }
  }

  await phase('idle', async () => {
    // A minute in space with nothing pressed: nothing should creep.
    await wait(p, 45000);
  });

  clearInterval(sampler);
  run.loads = loads;
  run.crashed = crashed;
  // Growth between the first and the last landing of a site.
  const asc = run.phases.filter((x) => x.name.startsWith('ascent'));
  if (asc.length >= 2 && asc[0].memory && asc.at(-1).memory) {
    const dh = asc.at(-1).memory.heapMB[1] - asc[0].memory.heapMB[1];
    const dl = asc.at(-1).memory.listeners[1] - asc[0].memory.listeners[1];
    run.growth = { heapMB: dh, listeners: dl, landings: asc.length };
    say(`  growth over ${asc.length} landings: heap ${dh > 0 ? '+' : ''}${dh} MB, listeners ${dl > 0 ? '+' : ''}${dl}`);
    if (dh > 120 * (asc.length - 1)) fail(`memory grows by ${dh} MB over ${asc.length} landings`);
    if (dl > 400 * (asc.length - 1)) fail(`event listeners grow by ${dl} over ${asc.length} landings`);
  }
  await ctx.close();
  return run;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium', args: GL });
const runs = [];
for (const profile of PROFILES) {
  say(`\n── ${profile} ──`);
  try { runs.push(await play(browser, profile)); } catch (e) { runs.push({ profile, failures: [`harness: ${e.message}`], phases: [] }); say(`  FAIL harness: ${e.message}`); }
}
await browser.close();

writeFileSync(`${OUT}report.json`, JSON.stringify(runs, null, 2));
const md = ['# Responsiveness report', '', `Server: ${BASE} · sites: ${SITES.join(', ')} · cycles: ${CYCLES}`, ''];
for (const r of runs) {
  md.push(`## ${r.profile}`, '', '| phase | s | game fps | worst stall ms | longest task ms | heap MB | listeners | GPU contexts |', '|---|---|---|---|---|---|---|---|');
  for (const x of r.phases) md.push(`| ${x.name} | ${x.secs} | ${x.gameFps} | ${x.worstStallMs} | ${x.mainThread?.worstLongMs ?? ''} | ${x.memory?.heapMB.join(' → ') ?? ''} | ${x.memory?.listeners.join(' → ') ?? ''} | ${x.contexts?.alive ?? ''} |`);
  md.push('', '**Slowest frames and their scripts**', '');
  for (const x of r.phases) for (const f of (x.worstFrames ?? []).slice(0, 2)) md.push(`- ${x.name}: ${f.ms} ms — ${f.scripts.map((s) => `${s.fn || s.invoker || '?'} (${s.src}:${s.pos}) ${s.ms} ms`).join('; ')}`);
  md.push('', r.failures.length ? `**Failures:**\n${r.failures.map((f) => `- ${f}`).join('\n')}` : '**No failures.**', '');
  if (r.notes?.length) md.push(`Notes:\n${r.notes.map((f) => `- ${f}`).join('\n')}`, '');
}
writeFileSync(`${OUT}report.md`, md.join('\n'));
const total = runs.reduce((a, r) => a + r.failures.length, 0);
say(total ? `\n${total} failure(s) — ${OUT}report.md` : `\nall clear — ${OUT}report.md`);
process.exit(total ? 1 : 0);
