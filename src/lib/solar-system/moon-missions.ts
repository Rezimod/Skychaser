// The five missions at Stellar Base, as data.
//
// First Steps teaches the controls by using them; Restore Power puts the
// lights back on; Telescope Calibration points the platform at something
// really above the lunar horizon tonight; Comms Failure gets Earth back on
// the line; the Expedition takes the rover out to a crater nobody has walked
// and brings a sample home. Each one leaves the base different from how it
// found it — that is what `onStart` and `onComplete` are for.
//
// The objectives name interactables (`moon-mission-props.ts`, plus the ones
// the surface already has) and world signals. Nothing here knows how any of
// them are drawn.

import type { Mission } from '@/lib/solar-system/missions';
import { makeMissions, type MissionsHandle } from '@/lib/solar-system/missions';
import { localMissionStore } from '@/lib/solar-system/mission-store';
import { academyMissionGate } from '@/lib/academy/gates';
import { CRATER, RIDGE, makeMissionProps, type MissionPropsHandle, type MissionPropsWorld } from '@/lib/solar-system/moon-mission-props';

export const MOON_MISSIONS: Mission[] = [
  {
    id: 'firstSteps',
    reward: 'firstSteps',
    objectives: [
      { id: 'suit', type: 'INTERACT', target: 'suitCheck' },
      { id: 'ridge', type: 'TRAVEL', target: 'ridge', at: { ...RIDGE, r: 7 } },
      { id: 'earthrise', type: 'PHOTOGRAPH', target: 'camera:earthrise', at: { ...RIDGE, r: 7 } },
      { id: 'airlock', type: 'ACTIVATE', target: 'airlock0' },
    ],
  },
  {
    id: 'power',
    requires: ['firstSteps'],
    reward: 'power',
    objectives: [
      { id: 'trace', type: 'INTERACT', target: 'deadCable' },
      { id: 'part', type: 'COLLECT', target: 'coupling' },
      { id: 'fit', type: 'INSTALL', target: 'fitCoupling' },
      { id: 'breaker', type: 'REPAIR', target: 'breaker' },
    ],
  },
  {
    id: 'telescope',
    requires: ['power'],
    reward: 'telescope',
    objectives: [
      { id: 'power', type: 'ACTIVATE', target: 'mountPower' },
      { id: 'align', type: 'INTERACT', target: 'mountAlign' },
      { id: 'observe', type: 'OBSERVE', target: 'scope:observed' },
    ],
  },
  {
    id: 'comms',
    requires: ['power'],
    reward: 'comms',
    objectives: [
      { id: 'inspect', type: 'INTERACT', target: 'dishInspect' },
      { id: 'feed', type: 'COLLECT', target: 'feed' },
      { id: 'fit', type: 'INSTALL', target: 'fitFeed' },
      { id: 'realign', type: 'REPAIR', target: 'dishAlign' },
    ],
  },
  {
    id: 'expedition',
    requires: ['telescope', 'comms'],
    reward: 'expedition',
    objectives: [
      { id: 'charge', type: 'ACTIVATE', target: 'roverCharge' },
      { id: 'board', type: 'INTERACT', target: 'roverEnter' },
      { id: 'drive', type: 'DRIVE', target: 'crater', at: { ...CRATER, r: 22 } },
      { id: 'scan', type: 'DISCOVER', target: 'scan:sample', at: { ...CRATER, r: 14 } },
      { id: 'collect', type: 'COLLECT', target: 'sample', at: { ...CRATER, r: 14 } },
      { id: 'store', type: 'INSTALL', target: 'storeSample' },
    ],
  },
];

export const MISSION_IDS = MOON_MISSIONS.map((m) => m.id);

export interface MoonMissionsHandle {
  props: MissionPropsHandle;
  missions: MissionsHandle;
  dispose: () => void;
}

/** The props, the engine and the world changes, wired to each other. */
export function makeMoonMissions(world: MissionPropsWorld): MoonMissionsHandle {
  const props = makeMissionProps(world);
  const missions = makeMissions({
    missions: MOON_MISSIONS,
    bus: world.bus,
    store: localMissionStore(MISSION_IDS),
    // In Stellar Academy's children's mode each mission waits for the lesson
    // that teaches it; everywhere else the gate is always open.
    gate: academyMissionGate(),
    onStart: (id) => {
      // The premise of a mission is set when it is taken on, not written into
      // the base: the power mission starts with the base dim, the comms one
      // with the dish knocked off Earth.
      if (id === 'power') {
        world.setState({ power: false });
        world.arrayFault.yaw = 0.8;
        world.setStatus('power', 'fault');
      }
      if (id === 'comms') {
        world.setState({ dishAligned: false });
        world.dishFault.yaw = 0.7;
        world.dishFault.pitch = 0.25;
        world.setStatus('comms', 'fault');
      }
      if (id === 'expedition') {
        world.setState({ charging: false });
        world.setStatus('charger', 'warn');
      }
    },
    onComplete: (id) => {
      if (id === 'power') world.setState({ power: true });
      if (id === 'comms') world.setState({ dishAligned: true });
      if (id === 'telescope') world.setState({ domeOpen: true });
    },
  });
  // A crew coming back mid-mission finds the base as they left it: the
  // premise still holds for whatever they had not yet put right.
  const t = missions.telemetry;
  const undone = (id: string) => !t.objectives.find((o) => o.id === id)?.done;
  if (t.active === 'power') {
    if (undone('fit')) world.arrayFault.yaw = 0.8;
    if (undone('breaker')) { world.setState({ power: false }); world.setStatus('power', 'fault'); }
  }
  if (t.active === 'comms' && undone('realign')) {
    world.setState({ dishAligned: false });
    world.dishFault.yaw = 0.7;
    world.dishFault.pitch = 0.25;
    world.setStatus('comms', 'fault');
  }
  if (t.active === 'expedition' && undone('charge')) {
    world.setState({ charging: false });
    world.setStatus('charger', 'warn');
  }

  return {
    props,
    missions,
    dispose() {
      missions.dispose();
      props.dispose();
    },
  };
}
