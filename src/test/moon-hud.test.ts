// What the Moon's glass shows, and when. The rules are pure, so this is the
// whole of the HUD's behaviour that can be checked without a scene.

import { describe, expect, it } from 'vitest';
import { motionShown, suitLevel, suitShown, GLANCE_SECONDS } from '@/lib/solar-system/moon-hud';

const calm = { o2: 97, power: 100, sinceChange: 1e4, firstPerson: false };

describe('the suit on the glass', () => {
  it('keeps quiet while everything is fine', () => {
    expect(suitShown(calm)).toBe(false);
    expect(suitLevel(calm)).toBe('ok');
  });

  it('shows itself when the air runs low', () => {
    expect(suitShown({ ...calm, o2: 24 })).toBe(true);
    expect(suitLevel({ ...calm, o2: 24 })).toBe('low');
    expect(suitLevel({ ...calm, o2: 9 })).toBe('critical');
  });

  it('shows itself when the pack runs low', () => {
    expect(suitShown({ ...calm, power: 29 })).toBe(true);
    expect(suitLevel({ ...calm, power: 8 })).toBe('critical');
  });

  it('comes up for a glance after a pressure change, then goes away', () => {
    expect(suitShown({ ...calm, sinceChange: GLANCE_SECONDS - 0.1 })).toBe(true);
    expect(suitShown({ ...calm, sinceChange: GLANCE_SECONDS + 0.1 })).toBe(false);
  });

  it('stays up while the crew is inside their own helmet', () => {
    expect(suitShown({ ...calm, firstPerson: true })).toBe(true);
  });
});

describe('speed and height', () => {
  it('shows neither when the crew is standing still', () => {
    expect(motionShown({ driving: false, speed: 0.2, airborne: false, altitude: 0 }))
      .toEqual({ speed: false, altitude: false });
  });

  it('shows speed once there is any, and always at the wheel', () => {
    expect(motionShown({ driving: false, speed: 2, airborne: false, altitude: 0 }).speed).toBe(true);
    expect(motionShown({ driving: true, speed: 0, airborne: false, altitude: 0 }).speed).toBe(true);
  });

  it('shows height only with air under the boots', () => {
    expect(motionShown({ driving: false, speed: 3, airborne: true, altitude: 2 }).altitude).toBe(true);
    expect(motionShown({ driving: false, speed: 3, airborne: true, altitude: 0.1 }).altitude).toBe(false);
    expect(motionShown({ driving: false, speed: 3, airborne: false, altitude: 4 }).altitude).toBe(false);
  });
});
