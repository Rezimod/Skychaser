import type { NightSkyData } from '@/lib/skychaser/night-sky';
import { FIGURES, NAMES, STARS } from './sky-catalog';

/**
 * The real sky over the roof, drawn for any minute of the night: the catalogue
 * stars and figures turned to that minute's sidereal time, the Moon and planets
 * where they stand, the city's rooftops on the horizon, and the telescope's
 * reticle slewing from target to target. One equirectangular view, alt over az,
 * that pans to follow the telescope.
 */

export type SkyAim = { at: number; aim: string };
export type SkyPoint = { name: string; alt: number; az: number; slewing: boolean };

const D = Math.PI / 180;
const DSO: Record<string, [number, number]> = { M31: [10.68, 41.27], M42: [83.82, -5.39], M45: [56.75, 24.12] };
const NAME: Record<string, string> = {
  Moon: 'Moon',
  Mars: 'Mars',
  Jupiter: 'Jupiter',
  Saturn: 'Saturn',
  M31: 'Andromeda Galaxy',
  M42: 'Orion Nebula',
  M45: 'Pleiades',
};
const PLANET: Record<string, string> = { Mars: '#ffa37a', Jupiter: '#fff4e2', Saturn: '#f2dca6' };
const RETICLE_SLEW = 16;
const VIEW_SLEW = 28;

const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/** J2000 to the night's date, the usual first-order precession (good to arcseconds over decades). */
function precess(ra: number, dec: number, years: number): [number, number] {
  const r = ra * D;
  const dRa = (46.1244 + 20.0431 * Math.sin(r) * Math.tan(clamp(dec, -89, 89) * D)) * years / 3600;
  const dDec = (20.0431 * Math.cos(r) * years) / 3600;
  return [(ra + dRa + 360) % 360, dec + dDec];
}

function starColour(bv: number) {
  if (bv < 0) return '205,222,255';
  if (bv < 0.3) return '228,236,255';
  if (bv < 0.65) return '255,249,240';
  if (bv < 1.1) return '255,226,192';
  return '255,200,160';
}

/** Rooftops and hills along the whole horizon, from a fixed seed, in degrees. */
function skyline() {
  let s = 20261114;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const blocks: { a: number; w: number; h: number; roof: number; mast: number; lit: [number, number][] }[] = [];
  for (let a = 0; a < 360; ) {
    const w = 1.2 + rnd() * 4.2;
    const tower = rnd() < 0.12;
    const h = tower ? 3.6 + rnd() * 2.4 : 0.9 + rnd() * 2.2;
    const lit: [number, number][] = [];
    const n = Math.floor(w * h * (tower ? 1.6 : 0.5));
    for (let i = 0; i < n; i++) if (rnd() < 0.22) lit.push([0.15 + rnd() * 0.7, 0.12 + rnd() * 0.7]);
    blocks.push({ a, w, h, roof: tower ? 0 : rnd() < 0.45 ? 1 : 0, mast: rnd() < 0.1 ? 1 + rnd() * 1.6 : 0, lit });
    a += w + (rnd() < 0.3 ? rnd() * 1.2 : 0);
  }
  return blocks;
}
const hill = (az: number) => 2.6 + 1.2 * Math.sin(az * D * 3 + 0.6) + 0.7 * Math.sin(az * D * 7 + 2.1) + 0.3 * Math.sin(az * D * 17 + 0.4);
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function createSky(canvas: HTMLCanvasElement, data: NightSkyData, plan: SkyAim[]) {
  const ctx = canvas.getContext('2d')!;
  const sinL = Math.sin(data.lat * D);
  const cosL = Math.cos(data.lat * D);

  const stars: { ra: number; sd: number; cd: number; mag: number; rgb: string }[] = [];
  for (let i = 0; i < STARS.length; i += 4) {
    const [ra, dec] = precess(STARS[i], STARS[i + 1], data.years);
    stars.push({ ra, sd: Math.sin(dec * D), cd: Math.cos(dec * D), mag: STARS[i + 2], rgb: starColour(STARS[i + 3]) });
  }
  const figures = FIGURES.map((f) => {
    const out: number[] = [];
    for (let i = 0; i < f.length; i += 2) out.push(...precess(f[i], f[i + 1], data.years));
    return out;
  });
  const names = NAMES.map(([n, ra, dec]) => [n.toUpperCase(), ...precess(ra, dec, data.years)] as [string, number, number]);
  const dso = Object.fromEntries(Object.entries(DSO).map(([k, [ra, dec]]) => [k, precess(ra, dec, data.years)]));
  const blocks = skyline();

  let W = 0;
  let H = 0;
  let dpr = 1;
  let H0 = 0;
  let sc = 8;
  let cx = 0;
  let font = 'sans-serif';
  let phone = false;

  const altAz = (ra: number, dec: number, lst: number): [number, number] => {
    const h = (lst - ra) * D;
    const sd = Math.sin(dec * D);
    const cd = Math.cos(dec * D);
    const sa = sd * sinL + cd * cosL * Math.cos(h);
    let alt = Math.asin(clamp(sa, -1, 1)) / D;
    const az = (Math.atan2(-cd * Math.sin(h), sd * cosL - cd * sinL * Math.cos(h)) / D + 360) % 360;
    if (alt > -1) alt += 1.02 / Math.tan((alt + 10.3 / (alt + 5.11)) * D) / 60;
    return [alt, az];
  };
  const radec = (id: string, hr: number): [number, number] => {
    const b = data.bodies.find((x) => x.id === id);
    if (b) return [(b.ra + b.dra * hr + 360) % 360, b.dec + b.ddec * hr];
    return dso[id] as [number, number];
  };
  const lstAt = (hr: number) => data.lst0 + 15.04107 * hr;
  const where = (id: string, hr: number) => altAz(...radec(id, hr), lstAt(hr));

  /** Where the telescope points (and where the view looks), easing from the last target to this one. */
  const aimAt = (min: number, slew: number): [number, number, string, boolean] => {
    const hr = min / 60;
    let i = 0;
    plan.forEach((p, j) => {
      if (min >= p.at) i = j;
    });
    const now = where(plan[i].aim, hr);
    if (i === 0 || plan[i - 1].aim === plan[i].aim) return [...now, plan[i].aim, false];
    const p = ease(clamp((min - plan[i].at) / slew, 0, 1));
    const was = where(plan[i - 1].aim, hr);
    return [was[0] + (now[0] - was[0]) * p, (was[1] + wrap(now[1] - was[1]) * p + 360) % 360, plan[i].aim, p < 1];
  };

  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth * dpr;
    H = canvas.clientHeight * dpr;
    canvas.width = W;
    canvas.height = H;
    phone = canvas.clientWidth < 821;
    H0 = H * (phone ? 0.56 : 0.8);
    sc = H0 / 84;
    cx = W * (phone ? 0.5 : 0.47);
    font = getComputedStyle(canvas).fontFamily || font;
  };

  const draw = (min: number): SkyPoint => {
    const hr = min / 60;
    const lst = lstAt(hr);
    const view = aimAt(min, VIEW_SLEW)[1];
    const [aAlt, aAz, aim, slewing] = aimAt(min, RETICLE_SLEW);
    // Following a high target, the view tilts up and the rooftops sink out of frame.
    const hz = Math.max(H0, aAlt * sc + H * (phone ? 0.36 : 0.24));
    const proj = (alt: number, az: number): [number, number] => [cx + wrap(az - view) * sc, hz - alt * sc];
    const k = clamp(sc / (8 * dpr), 0.75, 1.25) * dpr;

    // Sky: black overhead, the city's sodium-orange glow on the horizon
    const g = ctx.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, '#030409');
    g.addColorStop(0.55, '#080a14');
    g.addColorStop(1, '#1d1a22');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createLinearGradient(0, hz - 30 * sc, 0, hz);
    glow.addColorStop(0, 'rgba(255,140,90,0)');
    glow.addColorStop(0.7, 'rgba(255,140,90,0.07)');
    glow.addColorStop(1, 'rgba(255,150,100,0.2)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, hz);

    // Constellation figures and names
    ctx.lineWidth = 1 * dpr;
    ctx.strokeStyle = 'rgba(170,190,255,0.12)';
    ctx.beginPath();
    for (const f of figures) {
      let last: [number, number] | null = null;
      for (let i = 0; i < f.length; i += 2) {
        const [alt, az] = altAz(f[i], f[i + 1], lst);
        const p = alt > -3 ? proj(alt, az) : null;
        if (p && last && Math.abs(p[0] - last[0]) < W / 2) {
          ctx.moveTo(last[0], last[1]);
          ctx.lineTo(p[0], p[1]);
        }
        last = p;
      }
    }
    ctx.stroke();
    ctx.font = `500 ${10 * dpr}px ${font}`;
    ctx.textAlign = 'center';
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${2 * dpr}px`;
    ctx.fillStyle = 'rgba(200,210,255,0.26)';
    for (const [n, ra, dec] of names) {
      const [alt, az] = altAz(ra, dec, lst);
      if (alt < 8) continue;
      const [x, y] = proj(alt, az);
      if (x > -80 && x < W + 80) ctx.fillText(n, x, y);
    }

    // Stars, dimmed by the air toward the horizon
    for (const s of stars) {
      const h = (lst - s.ra) * D;
      const sa = s.sd * sinL + s.cd * cosL * Math.cos(h);
      if (sa < -0.02) continue;
      const alt = Math.asin(sa) / D;
      const az = (Math.atan2(-s.cd * Math.sin(h), s.sd * cosL - s.cd * sinL * Math.cos(h)) / D + 360) % 360;
      const [x, y] = proj(alt, az);
      if (x < -10 || x > W + 10) continue;
      const air = clamp(alt / 14, 0.2, 1);
      const a = clamp(1.35 - s.mag * 0.2, 0.2, 1) * air;
      const r = Math.max(0.6, 2.1 - 0.32 * s.mag) * k;
      if (s.mag < 1.6) {
        const gl = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
        gl.addColorStop(0, `rgba(${s.rgb},${0.3 * a})`);
        gl.addColorStop(1, `rgba(${s.rgb},0)`);
        ctx.fillStyle = gl;
        ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
      }
      ctx.fillStyle = `rgba(${s.rgb},${a})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // The two nebulae the eye can find, faintly
    const fuzz = (id: string, rx: number, ry: number, rot: number, rgb: string, a: number) => {
      const [alt, az] = where(id, hr);
      if (alt < 0) return;
      const [x, y] = proj(alt, az);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(1, ry / rx);
      const gl = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * sc);
      gl.addColorStop(0, `rgba(${rgb},${a})`);
      gl.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gl;
      ctx.beginPath();
      ctx.arc(0, 0, rx * sc, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    fuzz('M42', 0.9, 0.9, 0, '255,170,190', 0.22);
    fuzz('M31', 2.2, 0.7, -0.6, '220,225,255', 0.14);

    // The Moon, lit on the Sun's side, and the planets
    const [mAlt, mAz] = where('Moon', hr);
    if (mAlt > -1) {
      const [x, y] = proj(mAlt, mAz);
      const [sAlt, sAz] = altAz(data.sun.ra, data.sun.dec, lst);
      const sp = proj(sAlt, sAz);
      const ang = Math.atan2(sp[1] - y, sp[0] - x);
      const r = 0.9 * sc;
      const lit = data.moonLit;
      const halo = ctx.createRadialGradient(x, y, r, x, y, r * 7);
      halo.addColorStop(0, `rgba(255,244,225,${0.12 + lit * 0.2})`);
      halo.addColorStop(1, 'rgba(255,244,225,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(x - r * 7, y - r * 7, r * 14, r * 14);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(120,130,160,0.22)';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fbf3e4';
      ctx.beginPath();
      ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
      ctx.ellipse(0, 0, Math.abs(1 - 2 * lit) * r, r, 0, Math.PI / 2, -Math.PI / 2, lit < 0.5);
      ctx.fill();
      ctx.restore();
    }
    for (const id of ['Mars', 'Jupiter', 'Saturn']) {
      const [alt, az] = where(id, hr);
      if (alt < -0.5) continue;
      const [x, y] = proj(alt, az);
      const mag = data.bodies.find((b) => b.id === id)!.mag;
      const r = Math.max(1.6, 2.6 - 0.45 * mag) * k;
      const gl = ctx.createRadialGradient(x, y, 0, x, y, r * 6);
      gl.addColorStop(0, `${PLANET[id]}66`);
      gl.addColorStop(1, `${PLANET[id]}00`);
      ctx.fillStyle = gl;
      ctx.fillRect(x - r * 6, y - r * 6, r * 12, r * 12);
      ctx.fillStyle = PLANET[id];
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Labels for what the telescope can visit
    const [rx, ry] = proj(aAlt, aAz);
    ctx.font = `600 ${10 * dpr}px ${font}`;
    ctx.textAlign = 'left';
    for (const id of ['Moon', 'Mars', 'Jupiter', 'Saturn', 'M31', 'M42', 'M45']) {
      const [alt, az] = where(id, hr);
      if (alt < 1.5 || (id === aim && !slewing)) continue;
      const [x, y] = proj(alt, az);
      if (Math.hypot(x - rx, y - ry) < 70 * dpr) continue;
      ctx.fillStyle = 'rgba(244,244,246,0.5)';
      ctx.fillText(NAME[id].toUpperCase(), x + 10 * dpr, y + (id === 'Mars' ? 14 : -8) * dpr);
    }

    // Hills behind the city, then the rooftops
    ctx.fillStyle = '#0b0d17';
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W + 8; x += 8) {
      const az = view + (x - cx) / sc;
      ctx.lineTo(x, hz - hill(az) * sc);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    const base = hz + 1.2 * sc;
    const half = W / sc / 2 + 6;
    ctx.fillStyle = '#020307';
    ctx.fillRect(0, base, W, H - base);
    const lights: [number, number, number][] = [];
    for (const b of blocks) {
      const d = wrap(b.a - view);
      if (d < -half - 8 || d > half) continue;
      const x0 = cx + d * sc;
      const w = b.w * sc;
      const top = base - b.h * sc;
      ctx.fillRect(x0, top, w, base - top + 1);
      if (b.roof) {
        ctx.beginPath();
        ctx.moveTo(x0 - 0.2 * sc, top);
        ctx.lineTo(x0 + w / 2, top - Math.min(w * 0.3, 1.1 * sc));
        ctx.lineTo(x0 + w + 0.2 * sc, top);
        ctx.fill();
      }
      if (b.mast) ctx.fillRect(x0 + w * 0.7, top - b.mast * sc, Math.max(1, 0.12 * sc), b.mast * sc);
      for (const [u, v] of b.lit) lights.push([x0 + u * w, top + v * (base - top), 0.18 * sc]);
    }
    ctx.fillStyle = 'rgba(255,190,120,0.55)';
    for (const [x, y, s] of lights) ctx.fillRect(x, y, Math.max(1, s), Math.max(1, s * 0.8));

    // Compass under the rooftops
    ctx.font = `600 ${10 * dpr}px ${font}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(244,244,246,0.32)';
    for (let i = 0; i < 8; i++) {
      const x = cx + wrap(i * 45 - view) * sc;
      if (x > 20 && x < W - 20) ctx.fillText(COMPASS[i], x, base + 22 * dpr);
    }

    // The telescope: a reticle on its target, with the camera's real field inside
    const R = 24 * dpr;
    ctx.strokeStyle = 'rgba(255,138,91,0.95)';
    ctx.lineWidth = 1.4 * dpr;
    ctx.beginPath();
    ctx.arc(rx, ry, R, 0, Math.PI * 2);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.moveTo(rx + dx * (R + 4 * dpr), ry + dy * (R + 4 * dpr));
      ctx.lineTo(rx + dx * (R + 12 * dpr), ry + dy * (R + 12 * dpr));
    }
    ctx.stroke();
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(rx - Math.max(3 * dpr, 0.22 * sc), ry - Math.max(2 * dpr, 0.12 * sc), Math.max(6 * dpr, 0.43 * sc), Math.max(4 * dpr, 0.24 * sc));
    ctx.font = `600 ${11 * dpr}px ${font}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffb48f';
    if (!slewing) ctx.fillText(NAME[aim].toUpperCase(), rx + R + 16 * dpr, ry + 4 * dpr);

    return { name: NAME[aim], alt: aAlt, az: aAz, slewing };
  };

  resize();
  return { draw, resize };
}

export const compass = (az: number) =>
  ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(az / 45) % 8];
