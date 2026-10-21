// What a room shares between the network and the scenes. The scenes write
// where this explorer is into `self` every frame; the network sends it on at
// its own rate and fills `peers` with what the others sent. Neither side
// waits on the other.

import type { ShipKind } from '@/lib/solar-system/ship-mesh';

/** Where an explorer is: the system view, the deck, or on a surface. */
export type Scene = 'orbit' | 'flight' | 'surface';

/** One pose on the wire. Flight positions are offsets from the nearest body
 *  (scene units), so a ship turns up beside the same world for everyone even
 *  when their orreries are set to different dates. Surface positions are
 *  metres in that world's own frame. */
export interface PoseMsg {
  id: string;
  /** Sender's sequence number — drops out-of-order packets. */
  n: number;
  s: Scene;
  /** Surface: which world. */
  w?: string;
  /** Flight: the body the offsets are taken from. */
  b?: string;
  p?: number[];
  /** Flight: hull orientation, x y z w. */
  q?: number[];
  k?: ShipKind;
  /** Flight: the pilot outside on EVA, offset from the same body. */
  e?: number[];
  /** Surface: facing, rad. */
  y?: number;
  /** Surface: ground speed, m/s — drives the stride. */
  v?: number;
}

export interface Sample {
  at: number;
  msg: PoseMsg;
}

export interface Peer {
  id: string;
  name: string;
  samples: Sample[];
  lastSeq: number;
}

export interface RoomLink {
  self: PoseMsg;
  peers: Map<string, Peer>;
  /** The room this explorer is in, or null. */
  code: string | null;
}

declare global {
  interface Window {
    __stellarRoom?: RoomLink;
  }
}

/** In the system view: nowhere in particular. */
export function writeOrbitPose(self: PoseMsg): void {
  self.s = 'orbit';
  self.w = self.b = self.p = self.q = self.k = self.e = self.y = self.v = undefined;
}

/** How far behind the newest packet peers are drawn, so there is almost always
 *  a packet on each side of the moment being drawn. */
export const RENDER_DELAY_MS = 260;
const KEEP = 12;

export function createRoomLink(id: string): RoomLink {
  return { self: { id, n: 0, s: 'orbit' }, peers: new Map(), code: null };
}

export function pushSample(peer: Peer, msg: PoseMsg, at: number): void {
  if (msg.n <= peer.lastSeq) return;
  peer.lastSeq = msg.n;
  peer.samples.push({ at, msg });
  if (peer.samples.length > KEEP) peer.samples.splice(0, peer.samples.length - KEEP);
}

/** The two packets around `t` and how far between them `t` falls. Past the
 *  newest packet it holds the newest (no guessing ahead); before the oldest it
 *  holds the oldest. */
export function bracket(samples: Sample[], t: number): { a: PoseMsg; b: PoseMsg; alpha: number } | null {
  if (!samples.length) return null;
  const last = samples[samples.length - 1];
  if (t >= last.at) return { a: last.msg, b: last.msg, alpha: 0 };
  if (t <= samples[0].at) return { a: samples[0].msg, b: samples[0].msg, alpha: 0 };
  for (let i = samples.length - 1; i > 0; i--) {
    const lo = samples[i - 1];
    const hi = samples[i];
    if (t >= lo.at) return { a: lo.msg, b: hi.msg, alpha: (t - lo.at) / Math.max(1, hi.at - lo.at) };
  }
  return null;
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Seven significant figures: flight offsets are tiny numbers in scene units. */
export const trim = (x: number) => Number(x.toPrecision(7));

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;

export function makeRoomCode(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}

/** One Backrooms plan per room: everyone who falls in from the same room wakes in the same maze. */
export function seedFromCode(code: string): number {
  let h = 2166136261;
  for (let i = 0; i < code.length; i++) h = Math.imul(h ^ code.charCodeAt(i), 16777619);
  return 100000 + ((h >>> 0) % 900000);
}

/** A typed or linked code, cleaned up, or null if it cannot be one. */
export function normalizeRoomCode(raw: string): string | null {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length !== CODE_LENGTH) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}

/** Only the fields a pose may carry, with the types they must have — anything
 *  else arriving on the channel is dropped. */
export function readPose(raw: unknown): PoseMsg | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const nums = (v: unknown, len: number) => (Array.isArray(v) && v.length === len && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? (v as number[]) : undefined);
  const str = (v: unknown) => (typeof v === 'string' && v.length <= 40 ? v : undefined);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  if (typeof r.id !== 'string' || typeof r.n !== 'number') return null;
  if (r.s !== 'orbit' && r.s !== 'flight' && r.s !== 'surface') return null;
  const k = r.k === 'kestrel' || r.k === 'xfoil' || r.k === 'endurance' ? r.k : undefined;
  return { id: r.id, n: r.n, s: r.s, w: str(r.w), b: str(r.b), p: nums(r.p, 3), q: nums(r.q, 4), k, e: nums(r.e, 3), y: num(r.y), v: num(r.v) };
}
