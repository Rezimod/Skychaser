// Root motion: the short moves the crew makes that physics does not decide
// — over a crate, through a door, up onto a seat and down off it. A track
// is a few waypoints with a time for each leg; the body is carried along
// it, eased, with an optional arc on a leg for the body leaving the ground.
// Pure, so the sequences can be tested without a scene.

export type TrackKind = 'vault' | 'enterDoor' | 'exitDoor' | 'enterVehicle' | 'exitVehicle' | 'bail';

export interface Waypoint {
  x: number; y: number; z: number;
  /** Facing at the waypoint, rad. */
  yaw: number;
  /** Seconds to get here from the previous waypoint (ignored on the first). */
  t: number;
  /** Peak height the body adds over this leg, m. */
  arc?: number;
  /** Ease: 'smooth' both ends (default), 'in' accelerating, 'out' decelerating, 'linear'. */
  ease?: 'smooth' | 'in' | 'out' | 'linear';
}

export interface Track {
  kind: TrackKind;
  points: Waypoint[];
  duration: number;
}

export interface TrackPose { x: number; y: number; z: number; yaw: number; /** 0…1 through the track. */ k: number; /** Which leg. */ leg: number; /** 0…1 through the leg. */ legK: number }

const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const smooth = (t: number) => t * t * (3 - 2 * t);
const easeBy = (kind: Waypoint['ease'], t: number) => kind === 'linear' ? t : kind === 'in' ? t * t : kind === 'out' ? 1 - (1 - t) * (1 - t) : smooth(t);

export function makeTrack(kind: TrackKind, points: Waypoint[]): Track {
  let duration = 0;
  for (let i = 1; i < points.length; i++) duration += points[i].t;
  return { kind, points, duration: Math.max(1e-3, duration) };
}

/** Where the body is `time` seconds into the track. */
export function poseAt(track: Track, time: number, out: TrackPose): TrackPose {
  const pts = track.points;
  let t = Math.max(0, Math.min(track.duration, time));
  let i = 1;
  while (i < pts.length - 1 && t > pts[i].t) { t -= pts[i].t; i++; }
  const a = pts[i - 1]; const b = pts[i];
  const raw = b.t > 0 ? Math.min(1, t / b.t) : 1;
  const k = easeBy(b.ease, raw);
  out.x = a.x + (b.x - a.x) * k;
  out.z = a.z + (b.z - a.z) * k;
  out.y = a.y + (b.y - a.y) * k + (b.arc ?? 0) * Math.sin(Math.PI * raw);
  out.yaw = wrap(a.yaw + wrap(b.yaw - a.yaw) * k);
  out.k = Math.min(1, time / track.duration);
  out.leg = i - 1;
  out.legK = raw;
  return out;
}

/** Over a low obstacle: a plant, hands on the top, the body over, boots down on the far side. */
export function vaultTrack(from: { x: number; y: number; z: number; yaw: number }, top: number, toX: number, toY: number, toZ: number, speed: number, low: boolean): Track {
  const yaw = Math.atan2(toX - from.x, toZ - from.z);
  const mx = (from.x + toX) / 2; const mz = (from.z + toZ) / 2;
  const quick = Math.max(0.25, 0.45 - speed * 0.03);
  return makeTrack('vault', [
    { x: from.x, y: from.y, z: from.z, yaw, t: 0 },
    { x: mx, y: top + 0.05, z: mz, yaw, t: quick, ease: 'out' },
    { x: toX, y: toY, z: toZ, yaw, t: low ? quick * 1.4 : quick * 1.1, arc: 0.12, ease: 'in' },
  ]);
}

/** A walk from here to there at a set speed, turning to face the way. */
export function walkTrack(kind: TrackKind, from: { x: number; y: number; z: number; yaw: number }, to: { x: number; y: number; z: number; yaw?: number }, speed: number, hold = 0): Track {
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  const yaw = d > 0.05 ? Math.atan2(to.x - from.x, to.z - from.z) : from.yaw;
  const pts: Waypoint[] = [{ x: from.x, y: from.y, z: from.z, yaw: from.yaw, t: 0 }];
  if (hold > 0) pts.push({ x: from.x, y: from.y, z: from.z, yaw, t: hold, ease: 'smooth' });
  pts.push({ x: to.x, y: to.y, z: to.z, yaw: to.yaw ?? yaw, t: Math.max(0.2, d / speed), ease: 'linear' });
  return makeTrack(kind, pts);
}

/** Up onto a seat: to the door side, a step up, and sit — or the same in reverse. */
export function seatTrack(kind: 'enterVehicle' | 'exitVehicle', ground: { x: number; y: number; z: number; yaw: number }, seat: { x: number; y: number; z: number; yaw: number }, low: boolean): Track {
  const climb = low ? 0.85 : 0.65;
  const up: Waypoint[] = [
    { x: ground.x, y: ground.y, z: ground.z, yaw: ground.yaw, t: 0 },
    { x: ground.x, y: ground.y, z: ground.z, yaw: seat.yaw, t: 0.2 },
    { x: (ground.x + seat.x) / 2, y: seat.y + 0.15, z: (ground.z + seat.z) / 2, yaw: seat.yaw, t: climb, arc: 0.1, ease: 'out' },
    { x: seat.x, y: seat.y, z: seat.z, yaw: seat.yaw, t: 0.3, ease: 'smooth' },
  ];
  if (kind === 'enterVehicle') return makeTrack(kind, up);
  return makeTrack(kind, [
    { x: seat.x, y: seat.y, z: seat.z, yaw: seat.yaw, t: 0 },
    { x: (ground.x + seat.x) / 2, y: seat.y + 0.1, z: (ground.z + seat.z) / 2, yaw: seat.yaw, t: 0.3, ease: 'in' },
    { x: ground.x, y: ground.y, z: ground.z, yaw: ground.yaw, t: climb * 0.8, ease: 'out' },
  ]);
}
