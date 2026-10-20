// How the pilot moves through Tbilisi: like a third-person game rather than
// a pressure suit. It is the same locomotion as every other world — a full
// g, no suit — with a game's own speeds on top: a 3.3 m/s jog on the stick,
// a 6.4 m/s sprint on Shift, and a jump that clears a kerb with room.

import { EARTH_G, gaitProfile, type GaitProfile } from '@/lib/solar-system/suit-locomotion';

export function earthGait(): GaitProfile {
  const base = gaitProfile(EARTH_G, false);
  return {
    ...base,
    jog: 3.3,
    run: 4.6,
    sprint: 6.4,
    crouch: 1.3,
    accel: 14,
    brake: 12,
    hop: 3.0,
    turnStill: 12,
    turnStep: 0.16,
    reach: 1.25,
    air: 2.4,
    getUp: 0.7,
  };
}

/** The camera for it: low over the shoulder, quick to swing behind, a wider lens at a sprint. */
export const EARTH_CHASE = { height: 1.55, distance: 3.8, shoulder: 0.42, follow: 4.5, lead: 0.2, leadMax: 1.2, fovKick: 9, horizontal: 16, vertical: 9 };
