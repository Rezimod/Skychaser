// Tbilisi, put together for the world scene: the ground, the city, the
// landmarks, the cable car, the sky at the scene's clock, the weather from
// the forecast, and the expedition — plus the rules only Earth has: walls
// you cannot walk through, a river you cannot walk on, a stairwell to the
// rooftop, a cable car ride, and a clock that can be moved to dusk.
//
// world-surface creates this in place of the generic terrain and sky, and
// calls the hooks at the same points it calls the Mars base's.

import * as THREE from 'three';
import type { Collider } from '@/lib/solar-system/moon-cosmonaut';
import type { PointOfInterest } from '@/lib/solar-system/moon-base';
import type { Interactable } from '@/lib/solar-system/moon-interactions';
import type { DescentStart } from '@/lib/solar-system/moon-lander';
import { DEFAULT_OBSERVER } from '@/lib/observer-location';
import { centroid, insideRing, type EarthData } from '@/lib/solar-system/world-earth-data';
import { makeEarthTerrain, type EarthTerrain } from '@/lib/solar-system/world-earth-terrain';
import { makeEarthSky, type EarthSky } from '@/lib/solar-system/world-earth-sky';
import { makeCity } from '@/lib/solar-system/world-earth-city';
import { makeStreets } from '@/lib/solar-system/world-earth-streets';
import { makeLandmarks } from '@/lib/solar-system/world-earth-landmarks';
import { makeCableCar } from '@/lib/solar-system/world-earth-cablecar';
import { makeCityAmbience } from '@/lib/solar-system/world-earth-audio';
import { duskFor, pickTarget, tbilisiClock, type SkyTarget } from '@/lib/solar-system/world-earth-tonight';
import { makeTbilisiExpedition, type ExpeditionEvent, type ExpeditionTelemetry } from '@/lib/solar-system/world-earth-expedition';
import { makeCar, type CarHandle, type CarInput, type CarWorld } from '@/lib/solar-system/world-earth-car';
import { makePeople, type Mover } from '@/lib/solar-system/world-earth-people';
import { makeTraffic } from '@/lib/solar-system/world-earth-traffic';

/** From 600 m over the city, sinking at 38 m/s, coming in from the north-west over the river. The
 *  guidance only closes about a tenth of the gap a second, so the entry leaves it nearly overhead. */
export const EARTH_DESCENT: DescentStart = { alt: 600, descent: 38, offsetX: -35, offsetZ: -52, driftX: 2, driftZ: 3 };
export const EARTH_WALK_RADIUS = 1950;

export interface EarthState {
  expedition: ExpeditionTelemetry;
  clock: string;
  riding: boolean;
  onRoof: boolean;
  target: SkyTarget | null;
  /** The forecast's temperature, °C, when it has come in. */
  outsideC: number | null;
  /** The scene's clock. */
  date: Date;
  sunAlt: number;
  night: number;
  /** The rooftop's street door and the telescope on the roof, where the bake found a roof. */
  door: { x: number; z: number } | null;
  telescope: { x: number; z: number; y: number };
}

export interface EarthWorld {
  group: THREE.Group;
  sky: EarthSky;
  /** The ground to the Caucasus: the orbit view gives its rings their own ceilings. */
  terrain: EarthTerrain;
  heightAt: (x: number, z: number) => number;
  floorAt: (x: number, z: number) => number;
  colliders: Collider[];
  pois: PointOfInterest[];
  interactables: Interactable[];
  state: EarthState;
  /** Heading from the camera yaw, degrees clockwise from true north (−z). */
  heading: (camYaw: number) => number;
  cameraColliders: (x: number, z: number) => Collider[];
  /** True while the crew is carried (the ride): the walking simulation is skipped. */
  carried: () => boolean;
  /** After a walking step: walls, water, the roof's edge. `prev` is where the step started. */
  confine: (pos: THREE.Vector3, prev: THREE.Vector3) => void;
  update: (dt: number, crew: THREE.Vector3, heading: number, use: boolean, cameraPos: THREE.Vector3, place: (x: number, y: number, z: number) => void) => void;
  onEvent: ((kind: ExpeditionEvent | 'arrived' | 'enterCar' | 'exitCar') => void) | null;
  /** The pilot's car, parked by the pad. */
  car: CarHandle;
  driving: () => boolean;
  /** One simulation step at the wheel. `colliders` are the scene's own (the lander, the landmarks). */
  drive: (dt: number, input: CarInput, colliders: Collider[]) => void;
  /** The lander is down: bring the people who were in the park. */
  welcome: (x: number, z: number, faceX: number, faceZ: number) => void;
  /** How much of the welcome crowd is cheering, 0…1. */
  cheering: () => number;
  /** Cars near the crew, as circles to walk round. */
  walkers: (x: number, z: number) => Collider[];
  setTime: (iso: string) => void;
  advance: () => void;
  startAudio: () => void;
  dispose: () => void;
}

export function makeEarthWorld(renderer: THREE.WebGLRenderer, data: EarthData, lite: boolean, now = new Date()): EarthWorld {
  const group = new THREE.Group();
  group.name = 'earth';
  const sky = makeEarthSky(renderer, lite, now);
  const terrain = makeEarthTerrain(data.grids, now, lite);
  const heightAt = terrain.heightAt;
  const streets = makeStreets(data, heightAt, lite);
  const L = data.manifest.landmarks;
  const bridgeCentre = L.bridgeOfPeace.deck ? centroid(L.bridgeOfPeace.deck) : [-200, 60] as [number, number];
  // OSM maps the Bridge of Peace's roof as a raised building part; the landmark builds the real thing.
  const deck = L.bridgeOfPeace.deck ?? [];
  const overBridge = (b: EarthData['buildings'][number]) => b.minHeight > 0 && b.rings.some((r) => {
    const xs = r.pts.map((q) => q[0]); const zs = r.pts.map((q) => q[1]);
    return deck.some(([x, z]) => x > Math.min(...xs) - 5 && x < Math.max(...xs) + 5 && z > Math.min(...zs) - 5 && z < Math.max(...zs) + 5);
  });
  const city = makeCity(data.buildings.filter((b) => !overBridge(b)), heightAt, lite, [bridgeCentre[0], bridgeCentre[1] + 300]);
  const landmarks = makeLandmarks(data, heightAt, lite);
  const cable = L.cableCar.line ? makeCableCar(L.cableCar.line, heightAt, lite) : null;
  group.add(terrain.group, streets.group, city.group, landmarks.group);
  if (cable) group.add(cable.group);
  const ambience = makeCityAmbience();
  // The pilot's car, parked on the lawn east of the pad, nose to the north.
  const car = makeCar(9, -3, Math.PI, heightAt, lite);
  const traffic = makeTraffic(data, lite);
  const blockedMemo = new Map<number, boolean>();
  const people = makePeople(data, {
    floorAt: (x, z) => { const d = streets.deckAt(x, z); return Number.isNaN(d) ? heightAt(x, z) : Math.max(heightAt(x, z) - 0.5, d); },
    blocked: (x, z) => {
      // A footprint test walks every building nearby: remember the answer per square metre.
      const key = Math.round(x) * 8192 + Math.round(z);
      let hit = blockedMemo.get(key);
      if (hit === undefined) {
        hit = streets.isWater(x, z) || !Number.isNaN(city.roofAt(x, z));
        if (blockedMemo.size > 60000) blockedMemo.clear();
        blockedMemo.set(key, hit);
      }
      return hit;
    },
  }, lite);
  group.add(car.group, traffic.group, people.group);
  let driving = false;
  const movers: Mover[] = [];
  const carMovers: Mover[] = [];
  const nearPeople: Mover[] = [];
  const walkerList: Collider[] = [];
  const doorAt = new THREE.Vector3();
  const crewMover: Mover = { x: 0, z: 0, vx: 0, vz: 0, r: 0.5 };
  const parkedCar: Mover = { x: 0, z: 0, vx: 0, vz: 0, r: 1.9 };
  // What the car runs into this step: the scene's colliders plus the traffic, in one reused list.
  const hits: Collider[] = [];
  const carWorld: CarWorld = {
    floorAt: (x, z) => { const d = streets.deckAt(x, z); return Number.isNaN(d) ? heightAt(x, z) : Math.max(heightAt(x, z) - 0.5, d); },
    pushOut: (pos, r) => city.pushOut(pos, r, false),
    isWater: streets.isWater,
    colliders: () => hits,
  };

  const roof = city.rooftop;
  const site = (id: string) => landmarks.sites[id] ?? { x: 0, z: 0 };
  const telescope = roof
    ? { x: roof.hatch[0] + 3, z: roof.hatch[1] + 1.5, y: roof.roofY }
    : { x: 0, z: 0, y: heightAt(0, 0) };
  if (roof && !insideRing(telescope.x, telescope.z, roof.ring)) { telescope.x = roof.hatch[0]; telescope.z = roof.hatch[1]; }
  const expedition = makeTbilisiExpedition({
    bridgeWest: site('bridgeWest'),
    cableBottom: cable ? { x: cable.bottom.x, z: cable.bottom.z } : { x: 0, z: 0 },
    cableTop: cable ? { x: cable.top.x, z: cable.top.z } : { x: 0, z: 0 },
    sameba: site('sameba'), tvTower: site('tvTower'), bridgeOfPeace: site('bridgeOfPeace'),
    rooftopDoor: roof ? { x: roof.door[0], z: roof.door[1] } : { x: 0, z: 0 },
    telescope,
  });
  group.add(expedition.group);

  const state: EarthState = {
    expedition: expedition.telemetry, clock: tbilisiClock(now), riding: false, onRoof: false, target: null,
    outsideC: null, date: sky.state.date, sunAlt: sky.state.sunAlt, night: sky.state.night,
    door: roof ? { x: roof.door[0], z: roof.door[1] } : null, telescope,
  };
  let rideS = -1;
  let clockMinute = Math.floor(sky.state.dateMs / 60_000);
  type Hour = { time: string; cloudCover: number; visibility: number; temp: number };
  let forecast: Hour[] = [];
  let weatherFor = -Infinity;
  /** The forecast hour nearest the scene's clock, within three hours; the clock can be moved. */
  const applyWeather = () => {
    const at = sky.state.dateMs;
    weatherFor = at;
    let best: Hour | null = null; let bd = Infinity;
    for (const h of forecast) {
      // Open-Meteo hands back UTC hours without a zone.
      const d = Math.abs(Date.parse(`${h.time}Z`) - at);
      if (d < bd) { bd = d; best = h; }
    }
    if (!best || bd > 3 * 3600_000) { sky.setWeather(0, 30000); state.outsideC = null; return; }
    sky.setWeather(best.cloudCover / 100, best.visibility);
    state.outsideC = Math.round(best.temp);
  };
  const rideFloor = new THREE.Vector3();
  let pending: 'roofUp' | 'roofDown' | 'board' | null = null;

  const floorAt = (x: number, z: number) => {
    const ground = heightAt(x, z);
    if (state.onRoof && roof && insideRing(x, z, roof.ring)) return roof.roofY;
    const deck = streets.deckAt(x, z);
    return Number.isNaN(deck) ? ground : Math.max(ground - 0.5, deck);
  };

  /** The skyline from the rooftop at an azimuth: ground and roofs out to three kilometres, degrees. */
  const skyline = (az: number) => {
    if (!roof) return 0;
    const eye = roof.roofY + 1.6;
    const dx = Math.sin((az * Math.PI) / 180); const dz = -Math.cos((az * Math.PI) / 180);
    let worst = -5;
    for (let s = 12; s < 3000; s += s < 300 ? 6 : 40) {
      const x = roof.hatch[0] + dx * s; const z = roof.hatch[1] + dz * s;
      let top = heightAt(x, z);
      const r = city.roofAt(x, z);
      if (!Number.isNaN(r)) top = Math.max(top, r);
      worst = Math.max(worst, (Math.atan2(top - eye, s) * 180) / Math.PI);
    }
    return worst;
  };

  const handle: EarthWorld = {
    group, sky, terrain, heightAt, floorAt,
    colliders: [...landmarks.colliders],
    pois: [...landmarks.pois],
    interactables: [
      ...expedition.interactables,
      {
        id: 'enterCar', priority: 3, mode: 'foot',
        where: () => { car.door(doorAt); return { x: doorAt.x, z: doorAt.z, r: 2.8 }; },
        kind: () => 'tap', label: () => 'drive',
        use: () => { driving = true; handle.onEvent?.('enterCar'); },
      },
      {
        id: 'exitCar', priority: 3, mode: 'rover',
        where: () => ({ x: car.position.x, z: car.position.z, r: 1e6 }),
        kind: () => 'tap', label: () => (Math.abs(car.speed) < 2.5 ? 'getOut' : 'stopToExit'),
        use: () => { if (Math.abs(car.speed) < 2.5) { driving = false; handle.onEvent?.('exitCar'); } },
      },
    ],
    state,
    heading: (camYaw) => {
      // The camera looks along (−sin yaw, −cos yaw); north is −z.
      const fx = -Math.sin(camYaw); const fz = -Math.cos(camYaw);
      return ((Math.atan2(fx, -fz) * 180) / Math.PI + 360) % 360;
    },
    cameraColliders: (x, z) => city.cameraColliders(x, z),
    carried: () => rideS >= 0,
    car,
    driving: () => driving,
    drive(dt, input, colliders) {
      traffic.movers(car.position.x, car.position.z, 30, carMovers);
      hits.length = 0;
      for (const c of colliders) hits.push(c);
      for (const m of carMovers) hits.push(m);
      car.update(dt, input, carWorld, sky.state.night);
    },
    welcome: (x, z, faceX, faceZ) => people.welcome(x, z, faceX, faceZ),
    cheering: () => people.cheering(),
    walkers(x, z) {
      traffic.movers(x, z, 20, carMovers);
      walkerList.length = 0;
      for (const m of carMovers) walkerList.push(m);
      return walkerList;
    },
    confine(pos, prev) {
      if (state.onRoof && roof) {
        if (!insideRing(pos.x, pos.z, roof.ring)) { pos.x = prev.x; pos.z = prev.z; }
        return;
      }
      city.pushOut(pos, 0.45, false);
      if (streets.isWater(pos.x, pos.z)) { pos.x = prev.x; pos.z = prev.z; }
    },
    update(dt, crew, heading, use, cameraPos, place) {
      sky.update(dt, cameraPos);
      // The clock reads to the minute: the string is rebuilt when that changes, not every frame.
      const minute = Math.floor(sky.state.dateMs / 60_000);
      if (minute !== clockMinute) { clockMinute = minute; state.clock = tbilisiClock(sky.state.date); }
      if (forecast.length && Math.abs(sky.state.dateMs - weatherFor) > 20 * 60_000) applyWeather();
      state.date = sky.state.date;
      state.sunAlt = sky.state.sunAlt;
      state.night = sky.state.night;
      terrain.update(cameraPos);
      city.update(cameraPos, sky.state.night);
      streets.update(dt, cameraPos, sky.state.night);
      landmarks.update(dt, sky.state.night);
      cable?.update(dt, cameraPos);

      // Scene events the expedition asked for last frame.
      if (pending === 'board' && cable) { rideS = 0; state.riding = true; }
      else if (pending === 'roofUp' && roof) { state.onRoof = true; place(roof.hatch[0], roof.roofY, roof.hatch[1]); }
      else if (pending === 'roofDown' && roof) { state.onRoof = false; place(roof.door[0], heightAt(roof.door[0], roof.door[1]), roof.door[1]); }
      pending = null;

      if (rideS >= 0 && cable) {
        // Hold the action key and the ride goes six times as fast.
        rideS = Math.min(cable.length, rideS + dt * cable.speed * (use ? 6 : 1));
        cable.placeRide(rideS, rideFloor);
        place(rideFloor.x, rideFloor.y, rideFloor.z);
        if (rideS >= cable.length) {
          rideS = -1;
          state.riding = false;
          cable.placeRide(-1, rideFloor);
          // Off the platform onto the path to the walls.
          const tx = cable.top.x; const tz = cable.top.z;
          const ox = tx + 6; const oz = tz + 4;
          place(ox, heightAt(ox, oz), oz);
          expedition.arrived();
          handle.onEvent?.('arrived');
        }
      }
      expedition.update(dt, { x: crew.x, z: crew.z, heading, riding: rideS >= 0, onRoof: state.onRoof });

      // ── The street: people make way for the pilot and the cars; the cars stop for both. ──
      movers.length = 0;
      if (driving) { crewMover.x = car.position.x; crewMover.z = car.position.z; crewMover.vx = Math.sin(car.yaw) * car.speed; crewMover.vz = Math.cos(car.yaw) * car.speed; crewMover.r = 1.9; }
      else { crewMover.x = crew.x; crewMover.z = crew.z; crewMover.vx = 0; crewMover.vz = 0; crewMover.r = 0.5; }
      movers.push(crewMover);
      traffic.movers(crew.x, crew.z, 60, carMovers);
      for (const m of carMovers) movers.push(m);
      people.update(dt, crew.x, crew.z, movers);
      people.colliders(crew.x, crew.z, 120, nearPeople);
      nearPeople.push(crewMover);
      if (!driving) { parkedCar.x = car.position.x; parkedCar.z = car.position.z; nearPeople.push(parkedCar); }
      traffic.update(dt, crew.x, crew.z, nearPeople, sky.state.night, floorAt);
      ambience.engine(driving ? Math.abs(car.speed) : -1);
      ambience.cheer(people.cheering());
      let river = Infinity;
      for (const [rx, rz] of data.manifest.river) river = Math.min(river, Math.hypot(rx - crew.x, rz - crew.z));
      ambience.update(dt, sky.state.night, Math.max(0, river - 35), crew.y - streets.riverLevel(crew.x, crew.z));
    },
    onEvent: null,
    setTime(iso) {
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) sky.setDate(d);
    },
    advance: () => expedition.advance(),
    startAudio: () => ambience.start(),
    dispose() {
      ambience.dispose();
      car.dispose();
      traffic.dispose();
      people.dispose();
      expedition.dispose();
      cable?.dispose();
      landmarks.dispose();
      city.dispose();
      streets.dispose();
      terrain.dispose();
      sky.dispose();
    },
  };

  expedition.onEvent = (kind) => {
    if (kind === 'board' || kind === 'roofUp' || kind === 'roofDown') pending = kind;
    if (kind === 'dusk') {
      const at = duskFor(sky.state.date);
      if (at.getTime() !== sky.state.date.getTime()) sky.setDate(at);
      state.target = pickTarget(sky.state.date, skyline);
      expedition.setTarget(state.target);
    }
    handle.onEvent?.(kind);
  };
  // A crew coming back mid-first-light gets tonight's target again.
  if (expedition.telemetry.stage === 'firstLight' || expedition.telemetry.stage === 'done') {
    state.target = pickTarget(duskFor(sky.state.date), skyline);
    expedition.setTarget(state.target);
    if (expedition.telemetry.stage === 'done') { expedition.telemetry.scopeAz = state.target.az; expedition.telemetry.scopeAlt = state.target.alt; }
  }

  // The weather over Tbilisi right now, from the app's own forecast route.
  const abort = new AbortController();
  fetch(`/api/sky/forecast?lat=${DEFAULT_OBSERVER.lat}&lng=${DEFAULT_OBSERVER.lon}`, { signal: abort.signal })
    .then((r) => (r.ok ? r.json() : null))
    .then((days: { hours: Hour[] }[] | null) => {
      if (!Array.isArray(days)) return;
      forecast = days.flatMap((d) => d.hours);
      applyWeather();
    })
    .catch(() => { /* offline or rate-limited: a clear sky and no temperature */ });
  const dispose = handle.dispose;
  handle.dispose = () => { abort.abort(); dispose(); };
  return handle;
}
