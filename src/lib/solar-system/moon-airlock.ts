// Going indoors, and coming out. A run through an airlock is a short
// sequence of walks and waits: to the mark outside, the door cycles open,
// through into the chamber, the door seals behind, the chamber comes up to
// pressure — visor up, the suit goes soft — and on into the habitat. Out is
// the same the other way. This is the sequence alone: it asks for tracks
// and door actions and is told what the door is doing, so it can be tested
// without a scene.

import type { Doorway } from '@/lib/solar-system/moon-base';
import { walkTrack, type Track } from '@/lib/solar-system/suit-scripted';

export type AirlockDir = 'enter' | 'exit';
export type AirlockStep = 'toMark' | 'waitOpen' | 'through' | 'seal' | 'equalise' | 'onward' | 'done';

export type AirlockEvent =
  | { kind: 'track'; track: Track }
  | { kind: 'open' }
  | { kind: 'close' }
  /** Pressure is in (enter) or out (exit): visor and suit follow. */
  | { kind: 'pressurised' }
  | { kind: 'depressurised' }
  | { kind: 'done' };

export interface AirlockContext {
  /** The door as drawn, 0 shut … 1 open, and whether a cycle is still running. */
  doorOpen: number;
  cycling: boolean;
  /** The crew is being carried along a track this step. */
  tracking: boolean;
  from: { x: number; y: number; z: number; yaw: number };
}

export interface AirlockRun {
  dir: AirlockDir;
  step: AirlockStep;
  update: (dt: number, ctx: AirlockContext) => AirlockEvent | null;
}

/** How long the chamber takes to come up to, or down from, pressure. */
export const EQUALISE_SECONDS = 1.4;
const WALK = 1.1;

export function makeAirlockRun(door: Doorway, dir: AirlockDir): AirlockRun {
  let step: AirlockStep = 'toMark';
  let wait = 0;
  let asked = false;
  const yawOut = door.yawIn + Math.PI;
  const run: AirlockRun = {
    dir, step,
    update(dt, ctx) {
      const emit = (e: AirlockEvent, next: AirlockStep) => { step = next; run.step = next; asked = false; return e; };
      switch (step) {
        case 'toMark': {
          // Enter: walk to the mark outside. Exit: walk into the chamber.
          if (!asked) { asked = true; return { kind: 'track', track: walkTrack(dir === 'enter' ? 'enterDoor' : 'exitDoor', ctx.from, dir === 'enter' ? { ...door.outside, yaw: door.yawIn } : { ...door.chamber, yaw: yawOut }, WALK) }; }
          if (ctx.tracking) return null;
          if (dir === 'enter') return ctx.doorOpen > 0.85 ? emit({ kind: 'track', track: walkTrack('enterDoor', ctx.from, { ...door.chamber, yaw: door.yawIn }, WALK) }, 'through') : emit({ kind: 'open' }, 'waitOpen');
          wait = 0;
          return emit({ kind: 'depressurised' }, 'equalise');
        }
        case 'waitOpen':
          if (ctx.doorOpen < 0.85 || ctx.cycling) return null;
          return emit({ kind: 'track', track: walkTrack(dir === 'enter' ? 'enterDoor' : 'exitDoor', ctx.from, dir === 'enter' ? { ...door.chamber, yaw: door.yawIn } : { ...door.outside, yaw: yawOut }, WALK) }, dir === 'enter' ? 'through' : 'onward');
        case 'through':
          if (ctx.tracking) return null;
          wait = 0;
          return emit({ kind: 'close' }, 'seal');
        case 'seal':
          if (ctx.doorOpen > 0.1) return null;
          wait += dt;
          if (wait < EQUALISE_SECONDS) return null;
          return emit({ kind: 'pressurised' }, 'equalise');
        case 'equalise':
          if (dir === 'enter') return emit({ kind: 'track', track: walkTrack('enterDoor', ctx.from, { ...door.inside, yaw: door.yawIn }, WALK) }, 'onward');
          wait += dt;
          if (wait < EQUALISE_SECONDS) return null;
          return emit({ kind: 'open' }, 'waitOpen');
        case 'onward':
          if (ctx.tracking) return null;
          return emit({ kind: 'done' }, 'done');
        default:
          return null;
      }
    },
  };
  return run;
}
