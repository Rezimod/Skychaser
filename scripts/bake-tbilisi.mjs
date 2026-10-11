// Bakes the real ground for Explore Mode's Earth landing: Old Tbilisi and the
// Caucasus round it, out of open data, into static files the scene fetches
// when the ship comes down.
//
//   node scripts/bake-tbilisi.mjs
//
// Sources and licences (checked before this was written; keep CREDITS.md in step):
//   Elevation — AWS Terrain Tiles (Mapzen/Tilezen "terrarium"). In Georgia they
//     are SRTM and GMTED2010 (U.S. Geological Survey, public domain) and ETOPO1
//     (NOAA, public domain); commercial use allowed with credit. Copernicus
//     GLO-30/GLO-90 was the first choice, but its public release withholds the
//     tiles over Georgia.
//   City — OpenStreetMap via the Overpass API, ODbL. The files written here are
//     a derived database and are published under ODbL with the repo.
//
// Output, public/explore/tbilisi/:
//   terrain.bin   four height grids (walk area, city, valley, Caucasus) + land cover
//   city.bin      building footprints and heights, streets, water, trees
//   manifest.json origin, pad, rooftop, river levels, landmark geometry, credits
//   CREDITS.md
//
// Coordinates are a local tangent plane at the landing pad: x east, z south
// (so north is -z, as everywhere in the scene), metres.

import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import path from 'node:path';

const OUT = path.resolve('public/explore/tbilisi');
const CACHE = path.resolve(process.env.TMPDIR ?? '/tmp', 'skychaser-tbilisi-bake');
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const UA = 'skychaser-explore-bake/1.0 (+https://stellarr.club)';

/** Rike Park (OSM relation 9868102); the pad is searched for inside it, as
 *  near the east end of the Bridge of Peace as a clear lawn allows. */
const PARK = { lat: 41.6931312, lon: 44.8103002, relation: 9868102 };
const BRIDGE_EAST = { lat: 41.6932, lon: 44.8092 };
const FUKSAS_TUBES = 235147306;
const KARTLIS_DEDA = 1063062536;

const GRIDS = [
  { id: 'walk', n: 640, size: 4096, zoom: 13 },
  { id: 'city', n: 512, size: 12000, zoom: 13 },
  { id: 'valley', n: 512, size: 60000, zoom: 11 },
  { id: 'caucasus', n: 512, size: 480000, zoom: 8 },
];
const BUILDING_BOX = 4200;
const ROAD_BOX = 4000;
const COVER_BOX = 6200;
const TREE_BOX = 2400;

export const COVER = { ground: 0, grass: 1, forest: 2, water: 3, scrub: 4, building: 5, road: 6, plaza: 7, farmland: 8 };
export const ROOF = { flat: 0, gabled: 1, hipped: 2, pyramidal: 3, dome: 4, skillion: 5 };
export const KIND = { generic: 0, house: 1, apartments: 2, church: 3, commercial: 4, industrial: 5, shed: 6, historic: 7, public: 8 };
const ROAD = { motorway: 0, primary: 1, secondary: 2, tertiary: 3, residential: 4, service: 5, pedestrian: 6, footway: 7, steps: 8, path: 9 };

// ── Geodesy ──────────────────────────────────────────────────────────────
const RAD = Math.PI / 180;
const A = 6378137;
const E2 = 6.69437999014e-3;
function frame(lat0, lon0) {
  const s = Math.sin(lat0 * RAD);
  const w = 1 - E2 * s * s;
  const N = A / Math.sqrt(w);
  const M = (A * (1 - E2)) / Math.pow(w, 1.5);
  const kx = N * Math.cos(lat0 * RAD) * RAD;
  const kz = M * RAD;
  return {
    lat0, lon0,
    toLocal: (lat, lon) => [(lon - lon0) * kx, -(lat - lat0) * kz],
    toGeo: (x, z) => [lat0 - z / kz, lon0 + x / kx],
  };
}

// ── Cached fetch ─────────────────────────────────────────────────────────
async function cached(name, fetcher) {
  const file = path.join(CACHE, name);
  try {
    if ((await stat(file)).size > 0) return readFile(file);
  } catch { /* not cached */ }
  const buf = await fetcher();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buf);
  return buf;
}
async function get(url, attempt = 0) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.ok) return Buffer.from(await res.arrayBuffer());
  if (attempt < 4 && (res.status === 429 || res.status >= 500)) {
    await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
    return get(url, attempt + 1);
  }
  throw new Error(`${res.status} ${url}`);
}
async function overpass(name, query, attempt = 0) {
  const buf = await cached(`osm/${name}.json`, async () => {
    const res = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!res.ok) throw Object.assign(new Error(`overpass ${res.status} for ${name}`), { status: res.status });
    return Buffer.from(await res.arrayBuffer());
  }).catch(async (e) => {
    if (attempt < 4 && (e.status === 429 || e.status === 504 || e.status === 502)) {
      console.log(`  overpass busy (${e.status}), retrying ${name}`);
      await new Promise((r) => setTimeout(r, 20000 * (attempt + 1)));
      return null;
    }
    throw e;
  });
  if (buf === null) return overpass(name, query, attempt + 1);
  const json = JSON.parse(buf.toString('utf8'));
  if (json.remark && /runtime error|timed out/i.test(json.remark)) throw new Error(`overpass ${name}: ${json.remark}`);
  return json.elements;
}

// ── PNG (8-bit RGB/RGBA, non-interlaced: what terrarium tiles are) ────────
function decodePng(buf) {
  let p = 8;
  let w = 0; let h = 0; let channels = 3;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error('unsupported png');
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0;
      if (!channels) throw new Error(`png colour type ${data[9]}`);
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = channels;
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[o + x - bpp] : 0;
      const b = y > 0 ? out[o - stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[o - stride + x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a); const pb = Math.abs(pp - b); const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[o + x] = v & 255;
    }
  }
  const elev = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const k = i * bpp;
    elev[i] = out[k] * 256 + out[k + 1] + out[k + 2] / 256 - 32768;
  }
  return { w, h, elev };
}

// ── Elevation sampling from web-mercator tiles ────────────────────────────
function makeElevation(zoom) {
  const tiles = new Map();
  const n = 2 ** zoom;
  const need = new Set();
  const px = (lat, lon) => {
    const x = ((lon + 180) / 360) * n * 256;
    const s = Math.sin(lat * RAD);
    const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n * 256;
    return [x - 0.5, y - 0.5];
  };
  const at = (ix, iy) => {
    const tx = Math.floor(ix / 256); const ty = Math.floor(iy / 256);
    const t = tiles.get(`${tx}/${ty}`);
    if (!t) { need.add(`${tx}/${ty}`); return 0; }
    return t.elev[(iy - ty * 256) * 256 + (ix - tx * 256)];
  };
  // Catmull-Rom: 30 m data resampled to 6 m wants something smoother than bilinear.
  const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  return {
    sample(lat, lon) {
      const [x, y] = px(lat, lon);
      const ix = Math.floor(x); const iy = Math.floor(y);
      const fx = x - ix; const fy = y - iy;
      const rows = [];
      for (let j = -1; j <= 2; j++) rows.push(cr(at(ix - 1, iy + j), at(ix, iy + j), at(ix + 1, iy + j), at(ix + 2, iy + j), fx));
      return cr(rows[0], rows[1], rows[2], rows[3], fy);
    },
    async fill() {
      const list = [...need];
      need.clear();
      for (const key of list) {
        const buf = await cached(`terrarium/${zoom}/${key}.png`, () => get(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${key}.png`));
        tiles.set(key, decodePng(buf));
      }
      return list.length;
    },
  };
}

async function bakeGrid(spec, fr) {
  const elev = makeElevation(spec.zoom);
  const h = new Float32Array(spec.n * spec.n);
  const cell = spec.size / (spec.n - 1);
  const run = () => {
    for (let j = 0; j < spec.n; j++) for (let i = 0; i < spec.n; i++) {
      const [lat, lon] = fr.toGeo(-spec.size / 2 + i * cell, -spec.size / 2 + j * cell);
      h[j * spec.n + i] = elev.sample(lat, lon);
    }
  };
  run();
  const fetched = await elev.fill();
  if (fetched) { console.log(`  ${spec.id}: ${fetched} tiles at z${spec.zoom}`); run(); }
  return { ...spec, cell, h, cover: new Uint8Array(spec.n * spec.n) };
}

// ── Polygon rasterising onto a grid (scanline, even-odd across rings) ──────
function fillRings(grid, rings, fn) {
  const { n, size, cell } = grid;
  const half = size / 2;
  let minZ = Infinity; let maxZ = -Infinity;
  for (const r of rings) for (const [, z] of r) { if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
  const j0 = Math.max(0, Math.ceil((minZ + half) / cell));
  const j1 = Math.min(n - 1, Math.floor((maxZ + half) / cell));
  const xs = [];
  for (let j = j0; j <= j1; j++) {
    const z = -half + j * cell;
    xs.length = 0;
    for (const r of rings) {
      for (let k = 0; k < r.length; k++) {
        const [ax, az] = r[k]; const [bx, bz] = r[(k + 1) % r.length];
        if ((az <= z && bz > z) || (bz <= z && az > z)) xs.push(ax + ((z - az) / (bz - az)) * (bx - ax));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] + half) / cell));
      const i1 = Math.min(n - 1, Math.floor((xs[k + 1] + half) / cell));
      for (let i = i0; i <= i1; i++) fn(j * n + i);
    }
  }
}
function strokeLine(grid, pts, width, fn) {
  const { n, size, cell } = grid;
  const half = size / 2;
  const r = Math.max(width / 2, cell * 0.5);
  for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, az] = pts[k]; const [bx, bz] = pts[k + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(len / (cell * 0.5)));
    for (let s = 0; s <= steps; s++) {
      const x = ax + ((bx - ax) * s) / steps; const z = az + ((bz - az) * s) / steps;
      const i0 = Math.max(0, Math.ceil((x - r + half) / cell)); const i1 = Math.min(n - 1, Math.floor((x + r + half) / cell));
      const j0 = Math.max(0, Math.ceil((z - r + half) / cell)); const j1 = Math.min(n - 1, Math.floor((z + r + half) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if (Math.hypot(-half + i * cell - x, -half + j * cell - z) <= r) fn(j * n + i);
      }
    }
  }
}

// ── OSM helpers ───────────────────────────────────────────────────────────
function bboxAround(fr, halfSize) {
  const [s] = fr.toGeo(0, halfSize); const [nn] = fr.toGeo(0, -halfSize);
  const [, w] = fr.toGeo(-halfSize, 0); const [, e] = fr.toGeo(halfSize, 0);
  return `${s.toFixed(5)},${w.toFixed(5)},${nn.toFixed(5)},${e.toFixed(5)}`;
}
const ringOf = (fr, geom) => geom.map((g) => fr.toLocal(g.lat, g.lon));
/** Outer and inner rings of a way or a multipolygon relation, stitched. */
function polygonRings(fr, el) {
  if (el.type === 'way') return el.geometry ? [{ ring: ringOf(fr, el.geometry), inner: false }] : [];
  const out = [];
  for (const role of ['outer', 'inner']) {
    const parts = (el.members ?? []).filter((m) => m.type === 'way' && (m.role || 'outer') === role && m.geometry).map((m) => m.geometry.slice());
    while (parts.length) {
      let ring = parts.shift();
      let grew = true;
      while (grew && !(ring[0].lat === ring.at(-1).lat && ring[0].lon === ring.at(-1).lon)) {
        grew = false;
        for (let k = 0; k < parts.length; k++) {
          const p = parts[k];
          const end = ring.at(-1);
          if (p[0].lat === end.lat && p[0].lon === end.lon) { ring = ring.concat(p.slice(1)); }
          else if (p.at(-1).lat === end.lat && p.at(-1).lon === end.lon) { ring = ring.concat(p.slice(0, -1).reverse()); }
          else continue;
          parts.splice(k, 1);
          grew = true;
          break;
        }
      }
      if (ring.length >= 4) out.push({ ring: ringOf(fr, ring), inner: role === 'inner' });
    }
  }
  return out;
}
const area = (ring) => {
  let a = 0;
  for (let k = 0; k < ring.length; k++) { const [ax, az] = ring[k]; const [bx, bz] = ring[(k + 1) % ring.length]; a += ax * bz - bx * az; }
  return a / 2;
};
const num = (v) => {
  if (v === undefined) return NaN;
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*(m|ft)?\s*$/.exec(String(v).split(';')[0]);
  if (!m) return NaN;
  return m[2] === 'ft' ? Number(m[1]) * 0.3048 : Number(m[1]);
};
function rgb565(colour) {
  if (!colour) return 0;
  const named = { white: '#f2f0ea', yellow: '#e8c872', red: '#b0473a', brown: '#7a5a42', grey: '#9a9a96', gray: '#9a9a96', beige: '#d8c8a8', blue: '#4a6e9a', green: '#5f7f55', black: '#2a2a2a', orange: '#d88a3e', pink: '#d8a0a0', cream: '#efe4c8' };
  const hex = named[colour.toLowerCase()] ?? colour;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const v = parseInt(m[1], 16);
  return (((v >> 16) & 255) >> 3) << 11 | (((v >> 8) & 255) >> 2) << 5 | ((v & 255) >> 3) || 1;
}

// ── The bake ──────────────────────────────────────────────────────────────
async function main() {
  await mkdir(OUT, { recursive: true });
  const parkFrame = frame(PARK.lat, PARK.lon);

  console.log('OSM: the park, the pad search');
  const parkEls = await overpass('park', `[out:json][timeout:120];(relation(${PARK.relation});way(r);)->.p;.p out geom;(way["building"](around:260,${PARK.lat},${PARK.lon});node["natural"="tree"](around:260,${PARK.lat},${PARK.lon});way["highway"](around:260,${PARK.lat},${PARK.lon});way["leisure"~"playground|pitch|fountain"](around:260,${PARK.lat},${PARK.lon});way["amenity"="fountain"](around:260,${PARK.lat},${PARK.lon});way(${FUKSAS_TUBES});way["artwork_type"](around:260,${PARK.lat},${PARK.lon});node["tourism"="artwork"](around:260,${PARK.lat},${PARK.lon});way["natural"="water"](around:260,${PARK.lat},${PARK.lon});way["man_made"](around:260,${PARK.lat},${PARK.lon}););out geom;`);
  const parkRel = parkEls.find((e) => e.type === 'relation' && e.id === PARK.relation);
  const parkRings = polygonRings(parkFrame, parkRel);
  const obstacles = [];
  for (const e of parkEls) {
    if (e === parkRel) continue;
    if (e.type === 'node') { obstacles.push({ pts: [parkFrame.toLocal(e.lat, e.lon)], r: 7 }); continue; }
    if (!e.geometry) continue;
    const pts = ringOf(parkFrame, e.geometry);
    const t = e.tags ?? {};
    const r = t.building || t.leisure || t.amenity || t.natural || t.man_made ? 6 : t.highway === 'footway' || t.highway === 'path' ? 2 : 5;
    obstacles.push({ pts, r, poly: !!(t.building || t.leisure || t.natural || t.amenity) });
  }
  const inside = (x, z, rings) => {
    let c = false;
    for (const { ring } of rings) for (let k = 0, l = ring.length - 1; k < ring.length; l = k++) {
      const [ax, az] = ring[k]; const [bx, bz] = ring[l];
      if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) c = !c;
    }
    return c;
  };
  const segDist = (x, z, [ax, az], [bx, bz]) => {
    const dx = bx - ax; const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(x - ax - t * dx, z - az - t * dz);
  };
  const [bex, bez] = parkFrame.toLocal(BRIDGE_EAST.lat, BRIDGE_EAST.lon);
  let pad = null;
  let best = null;
  for (let z = -240; z <= 240; z += 2) for (let x = -240; x <= 240; x += 2) {
    if (!inside(x, z, parkRings)) continue;
    let clear = Infinity;
    for (const o of obstacles) {
      if (o.poly && inside(x, z, [{ ring: o.pts }])) { clear = 0; break; }
      for (let k = 0; k < o.pts.length; k++) {
        const d = o.pts.length === 1 ? Math.hypot(x - o.pts[0][0], z - o.pts[0][1]) : segDist(x, z, o.pts[k], o.pts[(k + 1) % o.pts.length]);
        clear = Math.min(clear, d - o.r);
      }
    }
    // Stay inside the park boundary by a margin, too.
    for (const { ring } of parkRings) for (let k = 0; k < ring.length; k++) clear = Math.min(clear, segDist(x, z, ring[k], ring[(k + 1) % ring.length]) - 4);
    // A lander wants twenty metres of lawn; past that, nearer the bridge wins.
    const score = Math.min(clear, 20) - Math.hypot(x - bex, z - bez) / 60;
    if (clear >= 10 && (!pad || score > pad.score)) pad = { x, z, clear, score };
    if (!best || clear > best.clear) best = { x, z, clear };
  }
  if (!pad) throw new Error(`no clear lawn for the pad; the clearest spot has ${best?.clear.toFixed(1)} m`);
  const [padLat, padLon] = parkFrame.toGeo(pad.x, pad.z);
  console.log(`  pad at ${padLat.toFixed(6)}, ${padLon.toFixed(6)} — ${pad.clear.toFixed(1)} m clear`);
  const fr = frame(padLat, padLon);

  console.log('Elevation');
  const grids = [];
  for (const spec of GRIDS) grids.push(await bakeGrid(spec, fr));
  const [walk, city] = grids;

  console.log('OSM: buildings');
  const bb = bboxAround(fr, BUILDING_BOX);
  const bldEls = [];
  {
    const [s, w, nn, e] = bb.split(',').map(Number);
    const ms = (s + nn) / 2; const mw = (w + e) / 2;
    const quads = [[s, w, ms, mw], [s, mw, ms, e], [ms, w, nn, mw], [ms, mw, nn, e]];
    for (let q = 0; q < 4; q++) {
      const box = quads[q].map((v) => v.toFixed(5)).join(',');
      bldEls.push(...await overpass(`buildings-${q}`, `[out:json][timeout:300][maxsize:1073741824];(way["building"](${box});relation["building"]["type"="multipolygon"](${box}););out geom;`));
    }
  }
  console.log('OSM: streets, water, cover, trees, landmarks');
  const roadEls = await overpass('roads', `[out:json][timeout:300];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|pedestrian|footway|steps|path|cycleway|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"](${bboxAround(fr, ROAD_BOX)});out geom;`);
  const waterEls = await overpass('water', `[out:json][timeout:300];(way["natural"="water"](${bboxAround(fr, 30000)});relation["natural"="water"](${bboxAround(fr, 30000)});way["waterway"="riverbank"](${bboxAround(fr, 30000)});way["waterway"="river"](${bboxAround(fr, 30000)}););out geom;`);
  const coverEls = await overpass('cover', `[out:json][timeout:300];(way["leisure"~"^(park|garden|pitch)$"](${bboxAround(fr, COVER_BOX)});relation["leisure"="park"](${bboxAround(fr, COVER_BOX)});way["landuse"~"^(grass|forest|meadow|cemetery|farmland|orchard|vineyard|recreation_ground|village_green)$"](${bboxAround(fr, COVER_BOX)});relation["landuse"~"^(forest|grass|meadow)$"](${bboxAround(fr, COVER_BOX)});way["natural"~"^(wood|scrub|grassland|bare_rock|scree|heath)$"](${bboxAround(fr, COVER_BOX)});relation["natural"~"^(wood|scrub|grassland)$"](${bboxAround(fr, COVER_BOX)});way["place"="square"](${bboxAround(fr, COVER_BOX)});way["highway"="pedestrian"]["area"="yes"](${bboxAround(fr, COVER_BOX)}););out geom;`);
  const treeEls = await overpass('trees', `[out:json][timeout:180];(node["natural"="tree"](${bboxAround(fr, TREE_BOX)});way["natural"="tree_row"](${bboxAround(fr, TREE_BOX)});node["highway"="street_lamp"](${bboxAround(fr, ROAD_BOX)}););out geom;`);
  const lmEls = await overpass('landmarks', `[out:json][timeout:180];(
    relation(9820020);way(r);
    way(125589004);way(1207561125);way(784030759);
    way(154331558);node(w);
    way(585352693);
    way(${FUKSAS_TUBES});
    way(${KARTLIS_DEDA});
    way(437940450);
    nwr["name"~"ქართლის დედა"];
    nwr["attraction"~"big_wheel|ferris_wheel"](41.690,44.775,41.702,44.795);
    way["barrier"~"wall|city_wall"](41.6855,44.8040,41.6905,44.8120);
    way["historic"~"citywalls|castle|tower|ruins"](41.6855,44.8040,41.6905,44.8120);
    nwr["amenity"="public_bath"](41.6860,44.8080,41.6905,44.8135);
    nwr["name"~"აბანო|Bath"](41.6860,44.8080,41.6905,44.8135);
  );out geom;`);

  // ── Buildings ──
  const LANDMARK_BUILDINGS = new Set([585352693, 437940450, 1207561125]);
  const buildings = [];
  let estimated = 0;
  for (const e of bldEls) {
    const t = e.tags ?? {};
    if (!t.building || t.building === 'no' || LANDMARK_BUILDINGS.has(e.id)) continue;
    if (t['building:part'] || t.building === 'roof' && !t.height) continue;
    const rings = polygonRings(fr, e);
    const outer = rings.filter((r) => !r.inner);
    if (!outer.length) continue;
    const footprint = outer.reduce((s, r) => s + Math.abs(area(r.ring)), 0);
    if (footprint < 6) continue;
    const levels = num(t['building:levels']);
    const roofLevels = num(t['roof:levels']);
    let height = num(t.height);
    let est = false;
    if (!(height > 0)) {
      if (levels > 0) height = levels * 3.2 + (roofLevels > 0 ? roofLevels * 2.6 : 0) + 1;
      else {
        // No height and no levels. Not guessed from the look of the place: a
        // plain storey count by what OSM says the building is, recorded as an
        // estimate in the manifest.
        est = true;
        const small = footprint < 60;
        height = t.building === 'garage' || t.building === 'shed' || t.building === 'kiosk' || small ? 3.2
          : t.building === 'house' || t.building === 'detached' ? 7.4
          : t.building === 'church' || t.building === 'chapel' ? 12
          : t.building === 'apartments' ? 5 * 3.2 + 1
          : 3 * 3.2 + 1;
      }
    }
    if (est) estimated += 1;
    const minH = num(t.min_height) > 0 ? num(t.min_height) : 0;
    const shape = String(t['roof:shape'] ?? '');
    const roof = /gabled|gambrel|mansard/.test(shape) ? ROOF.gabled : /hipped|half-hipped/.test(shape) ? ROOF.hipped
      : /pyramid/.test(shape) ? ROOF.pyramidal : /dome|onion/.test(shape) ? ROOF.dome : /skillion/.test(shape) ? ROOF.skillion
      : t.building === 'house' || t.building === 'detached' ? ROOF.hipped : ROOF.flat;
    const kind = /church|cathedral|chapel|monastery/.test(t.building) || t.amenity === 'place_of_worship' ? KIND.church
      : /house|detached|semidetached_house|terrace/.test(t.building) ? KIND.house
      : /apartments|residential|dormitory/.test(t.building) ? KIND.apartments
      : /commercial|retail|office|hotel|supermarket/.test(t.building) ? KIND.commercial
      : /industrial|warehouse|garage|garages|hangar/.test(t.building) ? KIND.industrial
      : /shed|kiosk|hut|roof|carport/.test(t.building) ? KIND.shed
      : t.historic || /historic|castle/.test(t.building) ? KIND.historic
      : /public|government|school|university|hospital|civic|train_station|museum|theatre/.test(t.building) ? KIND.public
      : KIND.generic;
    buildings.push({ id: e.id, rings, height, minH, roof, kind, levels: levels > 0 ? levels : 0, est, wall: rgb565(t['building:colour']), roofColour: rgb565(t['roof:colour']), footprint });
  }
  console.log(`  ${buildings.length} buildings (${estimated} with an estimated height)`);

  // ── Land cover ──
  const coverClass = (t) => {
    if (t.natural === 'water' || t.waterway === 'riverbank') return COVER.water;
    if (/^(forest)$/.test(t.landuse) || t.natural === 'wood') return COVER.forest;
    if (t.natural === 'scrub' || t.natural === 'heath' || t.natural === 'bare_rock' || t.natural === 'scree') return COVER.scrub;
    if (/farmland|orchard|vineyard/.test(t.landuse ?? '')) return COVER.farmland;
    if (t.place === 'square' || t.highway === 'pedestrian') return COVER.plaza;
    if (t.leisure || /grass|meadow|cemetery|recreation_ground|village_green/.test(t.landuse ?? '') || t.natural === 'grassland') return COVER.grass;
    return -1;
  };
  const polyCover = [];
  for (const e of coverEls) { const c = coverClass(e.tags ?? {}); if (c >= 0) polyCover.push({ c, rings: polygonRings(fr, e).map((r) => r.ring) }); }
  const waterPolys = [];
  const rivers = [];
  for (const e of waterEls) {
    const t = e.tags ?? {};
    if (t.waterway === 'river') { if (e.geometry) rivers.push({ name: t['name:en'] ?? t.name ?? '', pts: ringOf(fr, e.geometry) }); continue; }
    const rings = polygonRings(fr, e);
    if (rings.length) waterPolys.push({ id: e.id, name: t['name:en'] ?? t.name ?? '', rings });
  }
  const roads = [];
  const ROAD_W = { motorway: 14, trunk: 14, primary: 12, secondary: 10, tertiary: 8, unclassified: 6, residential: 6, living_street: 5, service: 4, pedestrian: 6, footway: 2.4, steps: 2.2, path: 1.6, cycleway: 2 };
  for (const e of roadEls) {
    const t = e.tags ?? {};
    const hw = t.highway.replace('_link', '');
    const cls = ROAD[hw === 'trunk' ? 'motorway' : hw === 'unclassified' || hw === 'living_street' ? 'residential' : hw === 'cycleway' ? 'path' : hw] ?? ROAD.path;
    const width = num(t.width) > 0 ? Math.min(30, num(t.width)) : (ROAD_W[hw] ?? 4) * (t.lanes && num(t.lanes) > 2 ? num(t.lanes) / 2 : 1);
    if (!e.geometry) continue;
    roads.push({ cls, width, bridge: !!t.bridge && t.bridge !== 'no', tunnel: !!t.tunnel && t.tunnel !== 'no', lit: t.lit === 'yes', layer: num(t.layer) || 0, pts: ringOf(fr, e.geometry) });
  }

  for (const g of [walk, city]) {
    for (const p of polyCover) if (p.c !== COVER.water) fillRings(g, p.rings, (i) => { g.cover[i] = p.c; });
    for (const r of roads) if (!r.tunnel && r.cls <= ROAD.tertiary) strokeLine(g, r.pts, r.width, (i) => { if (g.cover[i] !== COVER.water) g.cover[i] = COVER.road; });
    for (const b of buildings) fillRings(g, b.rings.map((r) => r.ring), (i) => { g.cover[i] = COVER.building; });
    for (const w of waterPolys) fillRings(g, w.rings.map((r) => r.ring), (i) => { g.cover[i] = COVER.water; });
  }
  for (const g of grids.slice(2)) for (const w of waterPolys) {
    const size = Math.abs(w.rings.reduce((s, r) => s + (r.inner ? -1 : 1) * Math.abs(area(r.ring)), 0));
    if (size > g.cell * g.cell * 2) fillRings(g, w.rings.map((r) => r.ring), (i) => { g.cover[i] = COVER.water; });
  }

  // ── Bare earth under the city: the radar saw the roofs. Where there are
  // buildings, take the ground from an opening (min then max) of the surface
  // model, never raising it. ──
  const bareEarth = (g, radiusM) => {
    const { n, h, cover } = g;
    const r = Math.max(1, Math.round(radiusM / g.cell));
    const pass = (src, pick) => {
      const tmp = new Float32Array(n * n); const out = new Float32Array(n * n);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        let v = src[j * n + i];
        for (let k = Math.max(0, i - r); k <= Math.min(n - 1, i + r); k++) v = pick(v, src[j * n + k]);
        tmp[j * n + i] = v;
      }
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        let v = tmp[j * n + i];
        for (let k = Math.max(0, j - r); k <= Math.min(n - 1, j + r); k++) v = pick(v, tmp[k * n + i]);
        out[j * n + i] = v;
      }
      return out;
    };
    const opened = pass(pass(h, Math.min), Math.max);
    // Weight by how built-up the neighbourhood is.
    const built = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      let c = 0; let t = 0;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        const jj = j + dj; const ii = i + di;
        if (jj < 0 || ii < 0 || jj >= n || ii >= n) continue;
        t += 1;
        if (cover[jj * n + ii] === COVER.building) c += 1;
      }
      built[j * n + i] = Math.min(1, (c / t) * 3);
    }
    for (let k = 0; k < n * n; k++) h[k] = h[k] - Math.max(0, h[k] - opened[k]) * built[k];
  };
  bareEarth(walk, 40);
  bareEarth(city, 50);

  // ── The river: a level that only ever falls downstream, and a bed under it. ──
  const mtkvari = rivers.filter((r) => /Mtkvari|Kura|მტკვარი/i.test(r.name));
  const centre = [];
  for (const r of mtkvari) for (const p of r.pts) if (Math.abs(p[0]) < 6200 && Math.abs(p[1]) < 6200) centre.push(p);
  // Order along the flow: the Mtkvari comes in from the north-west (x−, z−)
  // and leaves to the south-east (x+, z+).
  centre.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
  const sampleH = (g, x, z) => {
    const fi = Math.max(0, Math.min(g.n - 1.001, (x + g.size / 2) / g.cell));
    const fj = Math.max(0, Math.min(g.n - 1.001, (z + g.size / 2) / g.cell));
    const i = Math.floor(fi); const j = Math.floor(fj); const tx = fi - i; const tz = fj - j;
    const H = g.h; const n = g.n;
    return (H[j * n + i] * (1 - tx) + H[j * n + i + 1] * tx) * (1 - tz) + (H[(j + 1) * n + i] * (1 - tx) + H[(j + 1) * n + i + 1] * tx) * tz;
  };
  const levels = [];
  for (let k = 0; k < centre.length; k += Math.max(1, Math.floor(centre.length / 160))) {
    const [x, z] = centre[k];
    let lo = Infinity;
    for (let a = 0; a < 12; a++) for (const rr of [0, 15, 30]) lo = Math.min(lo, sampleH(city, x + Math.cos(a) * rr, z + Math.sin(a) * rr));
    levels.push([x, z, lo]);
  }
  for (let k = 1; k < levels.length; k++) levels[k][2] = Math.min(levels[k][2], levels[k - 1][2]);
  // Smooth, keeping it monotone.
  for (let pass = 0; pass < 4; pass++) for (let k = 1; k + 1 < levels.length; k++) levels[k][2] = Math.min(levels[k - 1][2], (levels[k - 1][2] + levels[k][2] * 2 + levels[k + 1][2]) / 4);
  const levelAt = (x, z) => {
    let best = levels[0]; let bd = Infinity;
    for (const l of levels) { const d = (l[0] - x) ** 2 + (l[1] - z) ** 2; if (d < bd) { bd = d; best = l; } }
    return best ? best[2] : 0;
  };
  for (const g of [walk, city]) {
    const { n, h, cover } = g;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i;
      if (cover[k] !== COVER.water) continue;
      const x = -g.size / 2 + i * g.cell; const z = -g.size / 2 + j * g.cell;
      h[k] = Math.min(h[k], levelAt(x, z) - 2.6);
    }
  }

  // ── The rooftop for the telescope: a flat roof in Avlabari, near Sameba,
  // with the lowest horizon to the south. Sololaki is under the ridge. ──
  const sameba = lmEls.find((e) => e.id === 585352693);
  const samebaC = sameba ? ringOf(fr, sameba.geometry).reduce((s, p, _, a) => [s[0] + p[0] / a.length, s[1] + p[1] / a.length], [0, 0]) : [700, -500];
  const byCell = new Map();
  for (const b of buildings) {
    const c = b.rings[0].ring.reduce((s, p, _, a) => [s[0] + p[0] / a.length, s[1] + p[1] / a.length], [0, 0]);
    b.cx = c[0]; b.cz = c[1];
    const key = `${Math.floor(c[0] / 50)},${Math.floor(c[1] / 50)}`;
    if (!byCell.has(key)) byCell.set(key, []);
    byCell.get(key).push(b);
  }
  const base = (b) => Math.min(...b.rings[0].ring.map(([x, z]) => sampleH(walk, x, z)));
  let rooftop = null;
  for (const b of buildings) {
    const d = Math.hypot(b.cx - samebaC[0], b.cz - samebaC[1]);
    if (d < 120 || d > 650 || b.roof !== ROOF.flat || b.footprint < 180 || b.footprint > 1400 || b.est) continue;
    if (!(b.height >= 12 && b.height <= 26)) continue;
    const eye = base(b) + b.height + 1.6;
    let worst = -90;
    for (let az = 120; az <= 240; az += 6) {
      const dx = Math.sin(az * RAD); const dz = -Math.cos(az * RAD);
      for (let s = 25; s < 5800; s += s < 400 ? 12 : 60) {
        const x = b.cx + dx * s; const z = b.cz + dz * s;
        let top = sampleH(s < 2000 ? walk : city, x, z);
        if (s < 600) for (const o of byCell.get(`${Math.floor(x / 50)},${Math.floor(z / 50)}`) ?? []) if (o !== b && Math.hypot(o.cx - x, o.cz - z) < 14) top = Math.max(top, base(o) + o.height);
        const alt = Math.atan2(top - eye - (s * s) / (2 * 6371000), s) / RAD;
        worst = Math.max(worst, alt);
      }
    }
    if (!rooftop || worst < rooftop.horizon) rooftop = { id: b.id, x: b.cx, z: b.cz, base: base(b), height: b.height, horizon: worst };
  }
  if (rooftop) console.log(`  rooftop: way ${rooftop.id}, ${rooftop.height.toFixed(1)} m, southern horizon ${rooftop.horizon.toFixed(1)}°`);

  // ── Landmarks: geometry straight from OSM, modelled in the scene. ──
  const lm = {};
  const wayPts = (id) => { const e = lmEls.find((x) => x.type === 'way' && x.id === id); return e?.geometry ? ringOf(fr, e.geometry) : null; };
  const pick = (pred) => lmEls.filter(pred);
  const centroid = (pts) => pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]);
  const at = (e) => (e.type === 'node' ? fr.toLocal(e.lat, e.lon) : e.center ? fr.toLocal(e.center.lat, e.center.lon) : centroid(ringOf(fr, e.geometry ?? [])));
  lm.bridgeOfPeace = { deck: wayPts(125589004) ?? wayPts(784030759), roof: wayPts(1207561125) };
  lm.cableCar = { line: wayPts(154331558) };
  lm.sameba = { outline: wayPts(585352693), height: 87 };
  lm.tvTower = { at: wayPts(437940450) ? centroid(wayPts(437940450)) : null, height: 274.5 };
  const kd = lmEls.find((e) => e.type === 'way' && e.id === KARTLIS_DEDA);
  lm.kartlisDeda = kd ? { at: at(kd), outline: ringOf(fr, kd.geometry), height: num(kd.tags?.height) || 20 } : null;
  const wheel = pick((e) => /big_wheel|ferris_wheel/.test(e.tags?.attraction ?? ''))[0];
  lm.ferrisWheel = wheel ? { at: at(wheel), height: num(wheel.tags?.height) > 0 ? num(wheel.tags.height) : null } : null;
  lm.narikalaWalls = pick((e) => e.type === 'way' && e.geometry && (/wall|city_wall/.test(e.tags?.barrier ?? '') || /citywalls|castle|ruins/.test(e.tags?.historic ?? '')) && e.id !== 9820020)
    .map((e) => ({ id: e.id, pts: ringOf(fr, e.geometry), closed: e.geometry[0].lat === e.geometry.at(-1).lat && e.geometry[0].lon === e.geometry.at(-1).lon }));
  lm.narikalaTowers = pick((e) => /tower/.test(e.tags?.historic ?? '') || e.tags?.['man_made'] === 'tower' && e.id !== 437940450).map(at);
  lm.baths = pick((e) => !e.tags?.highway && e.type === 'way' && e.geometry && (e.tags?.amenity === 'public_bath' || (e.tags?.building && /აბანო|Bath/.test(e.tags?.name ?? '')))).map((e) => ({ id: e.id, name: e.tags?.['name:en'] ?? e.tags?.name ?? '', at: at(e), outline: e.type === 'way' && e.geometry ? ringOf(fr, e.geometry) : null }));
  const tubes = lmEls.find((e) => e.type === 'way' && e.id === FUKSAS_TUBES);
  lm.rikeTubes = tubes ? { outline: ringOf(fr, tubes.geometry), tags: { height: tubes.tags?.height ?? null, name: tubes.tags?.['name:en'] ?? tubes.tags?.name ?? '' } } : null;
  lm.stations = pick((e) => e.type === 'node' && e.tags?.aerialway === 'station').map((e) => ({ which: e.tags['aerialway:station'] ?? '', at: at(e) }));
  for (const [k, v] of Object.entries(lm)) console.log(`  ${k}: ${v === null ? 'MISSING' : Array.isArray(v) ? `${v.length} found` : 'ok'}`);
  for (const w of lm.narikalaWalls) LANDMARK_BUILDINGS.add(w.id);
  LANDMARK_BUILDINGS.add(FUKSAS_TUBES);
  for (const b of lm.baths) LANDMARK_BUILDINGS.add(b.id);

  // ── Trees and lamps. ──
  const trees = [];
  const lamps = [];
  for (const e of treeEls) {
    if (e.type === 'node' && e.tags?.highway === 'street_lamp') { lamps.push(fr.toLocal(e.lat, e.lon)); continue; }
    if (e.type === 'node') { const [x, z] = fr.toLocal(e.lat, e.lon); trees.push([x, z, /needle/.test(e.tags?.leaf_type ?? '') ? 1 : 0, num(e.tags?.height) > 0 ? num(e.tags.height) : 0]); continue; }
    if (!e.geometry) continue;
    const pts = ringOf(fr, e.geometry);
    for (let k = 0; k + 1 < pts.length; k++) {
      const len = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]);
      for (let s = 0; s < len; s += 8) trees.push([pts[k][0] + ((pts[k + 1][0] - pts[k][0]) * s) / len, pts[k][1] + ((pts[k + 1][1] - pts[k][1]) * s) / len, 0, 0]);
    }
  }

  // ── Write terrain.bin ──
  const tparts = [Buffer.from('TBT1')];
  const hdr = Buffer.alloc(4); hdr.writeUInt32LE(grids.length); tparts.push(hdr);
  for (const g of grids) {
    const gh = Buffer.alloc(8); gh.writeUInt16LE(g.n, 0); gh.writeUInt16LE(0, 2); gh.writeFloatLE(g.size, 4);
    const hb = Buffer.alloc(g.n * g.n * 2);
    for (let k = 0; k < g.n * g.n; k++) hb.writeUInt16LE(Math.max(0, Math.min(65535, Math.round((g.h[k] + 100) * 10))), k * 2);
    tparts.push(gh, hb, Buffer.from(g.cover));
  }
  const terrainBuf = Buffer.concat(tparts);
  await writeFile(path.join(OUT, 'terrain.bin'), terrainBuf);

  // ── Write city.bin ──
  const chunks = [];
  const u8 = (v) => { const b = Buffer.alloc(1); b.writeUInt8(v); chunks.push(b); };
  const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); chunks.push(b); };
  const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); chunks.push(b); };
  const q = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 2)));
  const pts = (list) => {
    const b = Buffer.alloc(2 + list.length * 4);
    b.writeUInt16LE(list.length, 0);
    list.forEach(([x, z], k) => { b.writeInt16LE(q(x), 2 + k * 4); b.writeInt16LE(q(z), 4 + k * 4); });
    chunks.push(b);
  };
  const strip = (ring) => (ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring);
  chunks.push(Buffer.from('TBC1'));
  const kept = buildings.filter((b) => !LANDMARK_BUILDINGS.has(b.id));
  u32(kept.length);
  for (const b of kept) {
    u8((b.est ? 1 : 0) | (rooftop && b.id === rooftop.id ? 2 : 0));
    u8(b.kind); u16(Math.round(b.height * 10)); u16(Math.round(b.minH * 10)); u8(b.roof); u8(Math.min(255, b.levels));
    u16(b.wall); u16(b.roofColour);
    u8(Math.min(255, b.rings.length));
    for (const r of b.rings.slice(0, 255)) { u8(r.inner ? 1 : 0); pts(strip(r.ring)); }
  }
  const nearRoads = roads.filter((r) => r.pts.some(([x, z]) => Math.abs(x) < ROAD_BOX && Math.abs(z) < ROAD_BOX));
  u32(nearRoads.length);
  for (const r of nearRoads) {
    u8(r.cls); u8(Math.min(255, Math.round(r.width * 4))); u8((r.bridge ? 1 : 0) | (r.tunnel ? 2 : 0) | (r.lit ? 4 : 0)); u8(r.layer + 8);
    pts(r.pts);
  }
  const nearWater = waterPolys.filter((w) => w.rings.some((r) => r.ring.some(([x, z]) => Math.abs(x) < 6000 && Math.abs(z) < 6000)));
  u32(nearWater.length);
  for (const w of nearWater) {
    u8(Math.min(255, w.rings.length));
    for (const r of w.rings.slice(0, 255)) { u8(r.inner ? 1 : 0); pts(strip(r.ring).map(([x, z]) => [Math.max(-16000, Math.min(16000, x)), Math.max(-16000, Math.min(16000, z))])); }
  }
  u32(trees.length);
  for (const [x, z, kind, height] of trees) { const b = Buffer.alloc(6); b.writeInt16LE(q(x), 0); b.writeInt16LE(q(z), 2); b.writeUInt8(kind, 4); b.writeUInt8(Math.min(255, Math.round(height)), 5); chunks.push(b); }
  u32(lamps.length);
  for (const [x, z] of lamps) { const b = Buffer.alloc(4); b.writeInt16LE(q(x), 0); b.writeInt16LE(q(z), 2); chunks.push(b); }
  const cityBuf = Buffer.concat(chunks);
  await writeFile(path.join(OUT, 'city.bin'), cityBuf);

  const today = new Date().toISOString().slice(0, 10);
  const manifest = {
    version: 1,
    baked: today,
    origin: { lat: +padLat.toFixed(7), lon: +padLon.toFixed(7) },
    pad: { x: 0, z: 0, clear: +pad.clear.toFixed(1) },
    grids: grids.map((g) => ({ id: g.id, n: g.n, size: g.size })),
    rooftop,
    river: levels.map(([x, z, l]) => [Math.round(x), Math.round(z), +l.toFixed(2)]),
    landmarks: lm,
    stats: { buildings: kept.length, estimatedHeights: estimated, roads: nearRoads.length, water: nearWater.length, trees: trees.length, lamps: lamps.length, terrainBytes: terrainBuf.length, cityBytes: cityBuf.length },
  };
  const round = (key, v) => (typeof v === 'number' && !Number.isInteger(v) && key !== 'lat' && key !== 'lon' ? Math.round(v * 100) / 100 : v);
  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, round));
  await writeFile(path.join(OUT, 'CREDITS.md'), `# Tbilisi — Explore Mode ground data

Baked ${today} by \`node scripts/bake-tbilisi.mjs\`.

| File | What | Source | Licence |
|------|------|--------|---------|
| \`terrain.bin\` | Elevation grids: walk area (4 km, 6.4 m), city (12 km), valley (60 km), Caucasus (480 km) | AWS Terrain Tiles (Mapzen/Tilezen terrarium): SRTM and GMTED2010 courtesy of the U.S. Geological Survey; ETOPO1, U.S. National Oceanic and Atmospheric Administration | Public domain, credit given |
| \`terrain.bin\` (land cover), \`city.bin\`, \`manifest.json\` | Buildings, heights and levels, streets, the Mtkvari, parks, trees, street lamps, landmark outlines, the cable car | © OpenStreetMap contributors | ODbL 1.0 — https://www.openstreetmap.org/copyright. These files are a derived database and are published under the same licence. |

Buildings with no height or level count in OpenStreetMap (${estimated} of ${kept.length}) are given a plain storey count by building type; see \`scripts/bake-tbilisi.mjs\`.
The surface model is lowered to bare earth under built-up areas, and the river bed is cut below a water level taken from the model itself.

At runtime the scene also uses astronomy-engine (MIT) for the Sun, Moon and planets, and cloud cover from Open-Meteo (CC BY 4.0) through \`/api/sky/forecast\`.
`);
  console.log(`done: terrain ${(terrainBuf.length / 1e6).toFixed(2)} MB, city ${(cityBuf.length / 1e6).toFixed(2)} MB`);
  console.log(JSON.stringify(manifest.stats));
}

main().catch((e) => { console.error(e); process.exit(1); });
