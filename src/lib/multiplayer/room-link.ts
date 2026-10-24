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
  /** The sender's clock when it sent this (ms), so the others can space the
   *  packets as they were sent rather than as they happened to arrive. */
  t?: number;
}

/** One cannon bolt on the wire: where it left from, offset from a body the
 *  way flight poses are, and its velocity (scene units a second). */
export interface ShotMsg {
  id: string;
  b: string;
  p: number[];
  v: number[];
  t?: number;
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
  /** Local time minus the sender's clock, at the quickest packet seen. */
  offset?: number;
  /** When the last packet from them arrived (local ms). */
  heardAt?: number;
}

/** Another pilot as the flight scene sees them, for the HUD over it. */
export interface Blip {
  id: string;
  name: string;
  km: number;
  /** Screen position, -1..1 each way (y up); clamped to the edge when off screen. */
  x: number;
  y: number;
  onScreen: boolean;
  /** 0..1: a pilot whose packets stopped fades out. */
  alpha: number;
}

export interface RoomLink {
  self: PoseMsg;
  peers: Map<string, Peer>;
  /** The room this explorer is in, or null. */
  code: string | null;
  /** Bolts this ship fired, waiting for the network to send them. */
  shotsOut: ShotMsg[];
  /** Bolts the others fired, waiting for the scene to draw them (`at`: local time). */
  shotsIn: { at: number; msg: ShotMsg }[];
  /** What the flight scene last drew of the others: the HUD reads it. */
  view: { at: number; pilots: Blip[] };
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
/** A pilot not heard from for this long starts to fade; gone after FADE_MS more. */
export const STALE_MS = 5000;
export const FADE_MS = 1200;
const MAX_SHOTS_IN = 48;
/** How fast the clock offset may creep up (ms per ms) when the route gets slower. */
const OFFSET_CREEP = 0.01;

export function createRoomLink(id: string): RoomLink {
  return { self: { id, n: 0, s: 'orbit' }, peers: new Map(), code: null, shotsOut: [], shotsIn: [], view: { at: 0, pilots: [] } };
}

/** 1 while a peer is being heard, easing to 0 once their packets stop. */
export function peerAlpha(peer: Peer, now: number): number {
  const age = now - (peer.heardAt ?? now);
  return age <= STALE_MS ? 1 : Math.max(0, 1 - (age - STALE_MS) / FADE_MS);
}

/** Local time for something a peer sent at their clock `t`. The offset is the
 *  smallest arrival-minus-send seen (the quickest packet's), so the packets
 *  keep the spacing they were sent with however unevenly they arrive. */
export function peerTime(peer: Peer, t: number | undefined, arrived: number): number {
  if (t === undefined) return arrived;
  const off = arrived - t;
  const since = arrived - (peer.heardAt ?? arrived);
  // A first packet, or a clock that jumped: start again from this one.
  if (peer.offset === undefined || Math.abs(off - peer.offset) > 10_000) peer.offset = off;
  else peer.offset = Math.min(off, peer.offset + since * OFFSET_CREEP);
  return Math.min(arrived, t + peer.offset);
}

export function pushSample(peer: Peer, msg: PoseMsg, arrived: number): void {
  if (msg.n <= peer.lastSeq) return;
  peer.lastSeq = msg.n;
  let at = peerTime(peer, msg.t, arrived);
  peer.heardAt = arrived;
  const last = peer.samples[peer.samples.length - 1];
  if (last && at <= last.at) at = last.at + 1;
  peer.samples.push({ at, msg });
  if (peer.samples.length > KEEP) peer.samples.splice(0, peer.samples.length - KEEP);
}

/** A bolt from a peer, queued to be drawn when that peer's ship is (the same delay). */
export function pushShot(link: RoomLink, peer: Peer | undefined, msg: ShotMsg, arrived: number): void {
  const at = peer ? peerTime(peer, msg.t, arrived) : arrived;
  if (peer) peer.heardAt = arrived;
  link.shotsIn.push({ at, msg });
  if (link.shotsIn.length > MAX_SHOTS_IN) link.shotsIn.splice(0, link.shotsIn.length - MAX_SHOTS_IN);
}

/** The two packets around `t` and how far between them `t` falls. Past the
 *  newest packet it holds the newest, or, given `ahead`, carries the last
 *  step on for up to that long, so one late packet is not a stall and a
 *  snap. Before the oldest it holds the oldest. */
export function bracket(samples: Sample[], t: number, ahead = 0): { a: PoseMsg; b: PoseMsg; alpha: number } | null {
  if (!samples.length) return null;
  const last = samples[samples.length - 1];
  if (t >= last.at) {
    const prev = samples[samples.length - 2];
    const step = prev ? last.at - prev.at : 0;
    // Only a ship that was moving, packet on packet: not across a keepalive gap.
    if (ahead > 0 && prev && step > 0 && step < 600 && prev.msg.b === last.msg.b) {
      return { a: prev.msg, b: last.msg, alpha: 1 + Math.min(t - last.at, ahead) / step };
    }
    return { a: last.msg, b: last.msg, alpha: 0 };
  }
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

/** A range for a name tag or the pilots list. */
export const fmtRange = (km: number) => (km >= 1e6 ? `${(km / 1e6).toFixed(1)}M km` : km >= 1000 ? `${Math.round(km).toLocaleString('en-US')} km` : `${km.toFixed(km < 10 ? 2 : 0)} km`);

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
  const k = r.k === 'kestrel' || r.k === 'xfoil' || r.k === 'endurance' || r.k === 'cruiser' ? r.k : undefined;
  const pose: PoseMsg = { id: r.id, n: r.n, s: r.s, w: str(r.w), b: str(r.b), p: nums(r.p, 3), q: nums(r.q, 4), k, e: nums(r.e, 3), y: num(r.y), v: num(r.v) };
  const t = num(r.t);
  if (t !== undefined) pose.t = t;
  return pose;
}

/** A shot off the wire, or null: every field typed, the numbers finite and sane. */
export function readShot(raw: unknown): ShotMsg | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const vec = (v: unknown) => (Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 1e7) ? (v as number[]) : null);
  if (typeof r.id !== 'string' || r.id.length > 64 || typeof r.b !== 'string' || r.b.length > 40) return null;
  const p = vec(r.p);
  const v = vec(r.v);
  if (!p || !v) return null;
  const shot: ShotMsg = { id: r.id, b: r.b, p, v };
  if (typeof r.t === 'number' && Number.isFinite(r.t)) shot.t = r.t;
  return shot;
}
