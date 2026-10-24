import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { game } from '@/game/state';
import { markRelocale, readCheckpoint, takeRelocale, takeRelocaleMode, writeCheckpoint } from '@/game/save';
import { DEFAULT_MODE, hasObjectives, isGameMode, modeOr, titleModes } from '@/game/mode';
import { localStoryStore, makeStory, story, storyLine, STORY_KEY, type StorySample } from '@/game/story';
import { GameAccountContext, NO_ACCOUNT, type GameAccount } from '@/game/account';
import { freshSave, makeMissions } from '@/lib/solar-system/missions';
import { memoryMissionStore } from '@/lib/solar-system/mission-store';
import { freeFlyStore, makeMoonMissions, MOON_MISSIONS } from '@/lib/solar-system/moon-missions';
import { STORY_CHAPTERS, STORY_GEMS, STORY_HIGH_M, STORY_IDS, STORY_MISSIONS, STORY_WALK_M } from '@/lib/solar-system/story-chapters';
import { chapterStates } from '@/components/play/MissionsPanel';
import { inviteUrl } from '@/components/solar-system/ExploreRoomPanel';
import { TitleScreen } from '@/components/play/TitleScreen';
import type { InteractEvent, InteractionBus } from '@/lib/solar-system/moon-interactions';
import en from '@/messages/en.json';
import ka from '@/messages/ka.json';

function bus(): InteractionBus {
  const ls = new Set<(e: InteractEvent) => void>();
  return { on: (fn) => { ls.add(fn); return () => { ls.delete(fn); }; }, emit: (e) => { for (const fn of ls) fn(e); } };
}

describe('the mode in the state machine and the checkpoint', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); game.reset(); });

  it('starts in the mode picked, and the checkpoint keeps it', () => {
    game.boot();
    game.start('orbit', 'story');
    expect(game.get()).toMatchObject({ state: 'loading', scene: 'orbit', mode: 'story' });
    game.progress('ready');
    expect(readCheckpoint()).toMatchObject({ scene: 'orbit', mode: 'story' });
    // Landing keeps the mode: the checkpoint follows the scene, in the same mode.
    game.travel('mars', { seamless: true });
    game.progress('ready');
    expect(readCheckpoint()).toMatchObject({ scene: 'mars', mode: 'story' });
  });

  it('round-trips every mode, and an old save without one reads as Free Fly', () => {
    for (const m of ['free', 'story', 'multi'] as const) {
      writeCheckpoint('venus', m);
      expect(readCheckpoint()).toMatchObject({ scene: 'venus', mode: m });
    }
    localStorage.setItem('stellar_explore_save', JSON.stringify({ v: 1, scene: 'moon', savedAt: '2026-09-01T00:00:00Z' }));
    expect(readCheckpoint()).toEqual({ scene: 'moon', mode: 'free', savedAt: '2026-09-01T00:00:00Z' });
    localStorage.setItem('stellar_explore_save', JSON.stringify({ v: 1, scene: 'moon', mode: 'battle-royale' }));
    expect(readCheckpoint()?.mode).toBe(DEFAULT_MODE);
    expect(DEFAULT_MODE).toBe('free');
  });

  it('a deep link plays Free Fly; the pause menu goes back to the title, keeping the checkpoint', () => {
    game.boot('mars');
    expect(game.get().mode).toBe('free');
    game.progress('ready');
    game.pause();
    const g = game.get().generation;
    game.toTitle();
    expect(game.get()).toMatchObject({ state: 'title', overlay: 'none', generation: g + 1 });
    expect(readCheckpoint()?.scene).toBe('mars');
    // From the title, another mode.
    game.start('mars', 'story');
    expect(game.get().mode).toBe('story');
  });

  it('the multiplayer lobby is an overlay of the title', () => {
    game.boot();
    game.openOverlay('lobby');
    expect(game.get().overlay).toBe('lobby');
    game.start('orbit', 'multi');
    expect(game.get()).toMatchObject({ state: 'loading', overlay: 'none', mode: 'multi' });
  });

  it('a language switch comes back in the same mode', () => {
    markRelocale({ state: 'paused', scene: 'saturn', mode: 'story' });
    expect(takeRelocale()).toBe('saturn');
    expect(takeRelocaleMode()).toBe('story');
    expect(takeRelocaleMode()).toBeNull();
    markRelocale({ state: 'title', scene: 'orbit', mode: 'story' });
    expect(takeRelocaleMode()).toBeNull();
  });

  it('knows its modes', () => {
    expect(['free', 'story', 'multi'].every(isGameMode)).toBe(true);
    expect(isGameMode('pvp')).toBe(false);
    expect(modeOr(undefined)).toBe('free');
    expect(hasObjectives('story')).toBe(true);
    expect(hasObjectives('free')).toBe(false);
    expect(hasObjectives('multi')).toBe(false);
  });
});

describe('Free Fly turns the missions off', () => {
  beforeEach(() => localStorage.clear());

  it('no mission is taken on, the gate is not asked, and the saved progress is left alone', () => {
    const saved = { v: 1 as const, active: 'power', done: ['firstSteps'], rewards: ['firstSteps'], progress: [1, 0, 0, 0] };
    const store = memoryMissionStore(saved);
    const save = vi.spyOn(store, 'save');
    const gate = vi.fn(() => true);
    const m = makeMissions({ missions: MOON_MISSIONS, bus: bus(), store: freeFlyStore(store), gate: () => false });
    expect(m.telemetry.active).toBe('');
    expect(m.telemetry.objective).toBe('');
    expect(m.start()).toBeNull();
    expect(gate).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(store.load()).toEqual(saved);
  });

  it("on the Moon: the base keeps its power and its dish on Earth, and nothing is held behind a lesson", () => {
    const setState = vi.fn();
    const setStatus = vi.fn();
    const anchors = new Proxy({}, { get: () => ({ x: 0, z: 0, y: 0, yaw: 0 }) }) as never;
    const world = {
      heightAt: () => 0, anchors, lander: () => ({ x: 0, z: 0 }), earthDir: new THREE.Vector3(0, 1, 0),
      state: { power: true, dishAligned: true, domeOpen: false, charging: true } as never, setState,
      arrayFault: { yaw: 0 }, dishFault: { yaw: 0, pitch: 0 }, setStatus,
      carry: { item: null, has: () => false } as never, bus: bus(),
    };
    // Even a crew whose save has the power mission in hand.
    const store = memoryMissionStore({ v: 1, active: 'power', done: ['firstSteps'], rewards: [], progress: [] });
    const free = makeMoonMissions(world, { free: true, store });
    expect(free.missions.telemetry.active).toBe('');
    expect(setState).not.toHaveBeenCalledWith(expect.objectContaining({ power: false }));
    expect(world.arrayFault.yaw).toBe(0);
    expect(world.dishFault.yaw).toBe(0);
    free.dispose();
    // The story plays the same save with its premise.
    const played = makeMoonMissions(world, { store });
    expect(played.missions.telemetry.active).toBe('power');
    expect(setState).toHaveBeenCalledWith(expect.objectContaining({ power: false }));
    played.dispose();
  });
});

const at = (world: StorySample['world'], s: Partial<StorySample> = {}): StorySample => ({ world, landed: true, outside: true, ...s });

describe('the Grand Tour', () => {
  beforeEach(() => { localStorage.clear(); story.reset(); game.reset(); });

  it('is nine chapters in order, Moon first and home last, each one waiting for the one before', () => {
    expect(STORY_IDS).toEqual(['moon', 'mars', 'venus', 'mercury', 'jupiter', 'saturn', 'uranus', 'neptune', 'earth']);
    expect(STORY_MISSIONS[0].requires).toBeUndefined();
    STORY_MISSIONS.slice(1).forEach((m, i) => expect(m.requires).toEqual([STORY_IDS[i]]));
    // Every chapter starts with the landing at its own world.
    for (const c of STORY_CHAPTERS) expect(c.objectives[0]).toMatchObject({ id: 'land', target: `landed:${c.world}` });
  });

  it('opens on the Moon, and First Steps there finishes the chapter', () => {
    const s = makeStory(memoryMissionStore());
    expect(s.get()).toMatchObject({ active: 'moon', index: 1, objective: 'land', world: 'moon' });
    // The wrong world counts for nothing.
    s.observe(at('mars', { missionsDone: ['firstSteps'] }));
    expect(s.get().objective).toBe('land');
    s.observe(at('moon', { outside: false, landed: true }));
    expect(s.get().objective).toBe('firstSteps');
    s.observe(at('moon', { missionsDone: [] }));
    expect(s.get().active).toBe('moon');
    s.observe(at('moon', { missionsDone: ['firstSteps'] }));
    expect(s.get()).toMatchObject({ active: 'mars', card: 'moon', done: ['moon'], index: 2 });
    s.dismissCard();
    expect(s.get().card).toBe('');
  });

  it('a chapter is its objectives in order: land, step out, the panel, then the gems or the climb', () => {
    const store = memoryMissionStore({ ...freshSave(), done: ['moon'], active: 'mars' });
    const s = makeStory(store);
    // Out of order: the panel before stepping out does not count.
    s.observe(at('mars', { landed: true, outside: false, readout: 'greenhouse' }));
    expect(s.get().objective).toBe('out');
    s.observe(at('mars', { readout: 'habitat' }));
    expect(s.get().objective).toBe('read');
    s.observe(at('mars', { readout: 'greenhouse' }));
    expect(s.get().objective).toBe('gems');
    s.observe(at('mars', { gems: 1, gemsTotal: 22 }));
    expect(s.get().objectives.find((o) => o.id === 'gems')).toMatchObject({ progress: 1, required: STORY_GEMS });
    s.observe(at('mars', { gems: 3, gemsTotal: 22 }));
    expect(s.get()).toMatchObject({ active: 'venus', card: 'mars' });
    // Venus asks for the climb.
    s.observe(at('venus'));
    s.observe(at('venus', { readout: 'cooler' }));
    expect(s.get().objective).toBe('high');
    s.observe(at('venus', { altitude: STORY_HIGH_M - 1 }));
    expect(s.get().active).toBe('venus');
    s.observe(at('venus', { altitude: STORY_HIGH_M + 0.5 }));
    expect(s.get().active).toBe('mercury');
  });

  it('gems already held on the world count; a world with fewer asks for all it has, one with none for none', () => {
    const s = makeStory(memoryMissionStore({ ...freshSave(), done: STORY_IDS.slice(0, 3), active: 'mercury' }));
    s.observe(at('mercury', { readout: 'sunshade' }));
    s.observe(at('mercury', { readout: 'sunshade', gems: 0, gemsTotal: 0 }));
    expect(s.get().active).toBe('jupiter');
    const t = makeStory(memoryMissionStore({ ...freshSave(), done: STORY_IDS.slice(0, 1), active: 'mars' }));
    t.observe(at('mars', { readout: 'greenhouse' }));
    t.observe(at('mars', { gems: 1, gemsTotal: 2 }));
    expect(t.get().active).toBe('mars');
    t.observe(at('mars', { gems: 2, gemsTotal: 2 }));
    expect(t.get().active).toBe('venus');
    const u = makeStory(memoryMissionStore({ ...freshSave(), done: STORY_IDS.slice(0, 1), active: 'mars' }));
    u.observe(at('mars', { readout: 'greenhouse' }));
    u.observe(at('mars', { gems: 7, gemsTotal: 22 }));
    expect(u.get().active).toBe('venus');
  });

  it('ends at home: the walk through Tbilisi finishes the tour', () => {
    const s = makeStory(memoryMissionStore({ ...freshSave(), done: STORY_IDS.slice(0, 8), active: 'earth' }));
    s.observe(at('earth'));
    s.observe(at('earth', { distance: STORY_WALK_M - 5 }));
    expect(s.get().complete).toBe(false);
    s.observe(at('earth', { distance: STORY_WALK_M }));
    expect(s.get()).toMatchObject({ active: '', complete: true, card: 'earth', index: 0 });
  });

  it('is saved as it goes and picks up where it was left, mid-chapter', () => {
    const a = makeStory(localStoryStore());
    a.observe(at('moon', { missionsDone: ['firstSteps'] }));
    a.observe(at('mars'));
    a.dispose();
    expect(JSON.parse(localStorage.getItem(STORY_KEY)!)).toMatchObject({ active: 'mars', done: ['moon'] });
    const b = makeStory(localStoryStore());
    expect(b.get()).toMatchObject({ active: 'mars', objective: 'read' });
    // A forged save is cleaned up rather than trusted.
    localStorage.setItem(STORY_KEY, JSON.stringify({ v: 1, active: 'pluto', done: ['pluto', 'moon'], progress: ['x'] }));
    expect(makeStory(localStoryStore()).get()).toMatchObject({ active: 'mars', done: ['moon'] });
    b.restart();
    expect(b.get()).toMatchObject({ active: 'moon', done: [], objective: 'land' });
  });

  it('plays a briefing once a session per chapter, line by line, unless asked again', () => {
    const s = makeStory(memoryMissionStore());
    expect(s.brief()).toBe(true);
    expect(s.get().briefing).toEqual({ chapter: 'moon', line: 1 });
    s.nextLine(); s.nextLine();
    expect(s.get().briefing?.line).toBe(3);
    s.nextLine();
    expect(s.get().briefing).toBeNull();
    expect(s.brief()).toBe(false);
    expect(s.brief(true)).toBe(true);
    s.endBriefing();
    expect(s.get().briefing).toBeNull();
  });

  it('only listens in Story mode', () => {
    game.boot('moon', 'free');
    story.observe(at('moon', { missionsDone: ['firstSteps'] }));
    expect(story.get().active).toBe('moon');
    expect(story.get().objective).toBe('land');
    game.reset();
    game.boot('moon', 'story');
    story.observe(at('moon', { missionsDone: ['firstSteps'] }));
    expect(story.get().active).toBe('mars');
  });

  it('puts its objective on the right surface only, and the log reads the chapters', () => {
    const s = makeStory(memoryMissionStore({ ...freshSave(), done: ['moon'], active: 'mars' }));
    expect(storyLine(s.get(), 'venus')).toBeNull();
    expect(storyLine(s.get(), 'mars')).toMatchObject({ chapter: 'mars', index: 2, key: 'chapters.mars.obj.land', progress: '' });
    s.observe(at('mars', { readout: 'greenhouse' }));
    expect(storyLine(s.get(), 'mars')).toMatchObject({ key: 'chapters.mars.obj.gems', progress: `0 / ${STORY_GEMS}` });
    expect(chapterStates(s.get()).slice(0, 3)).toEqual([
      { id: 'moon', state: 'done' }, { id: 'mars', state: 'next' }, { id: 'venus', state: 'locked' },
    ]);
  });

  it('has every line it needs in English and Georgian', () => {
    for (const msgs of [en, ka] as unknown as { play: { story: { chapters: Record<string, { name: string; done: string; brief: Record<string, string>; obj: Record<string, string> }> } } }[]) {
      for (const c of STORY_CHAPTERS) {
        const m = msgs.play.story.chapters[c.id];
        expect(m.name && m.done).toBeTruthy();
        expect(Object.keys(m.brief)).toEqual(['l1', 'l2', 'l3']);
        for (const o of c.objectives) expect(m.obj[o.id], `${c.id}.${o.id}`).toBeTruthy();
      }
    }
  });
});

describe('multiplayer is offered wherever there is a realtime service', () => {
  it('as a rule', () => {
    expect(titleModes({ online: true })).toEqual(['free', 'story', 'multi']);
    expect(titleModes({ online: false })).toEqual(['free', 'story']);
  });

  it('an invite link is the game page and the code, nothing else', () => {
    expect(inviteUrl('K7M2Q', { origin: 'https://stellar.example', pathname: '/play' })).toBe('https://stellar.example/play?room=K7M2Q');
  });

  describe('on the title', () => {
    let root: Root;
    beforeAll(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); });
    beforeEach(() => { localStorage.clear(); story.reset(); });
    afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); });
    const render = (account: GameAccount, online: boolean) => {
      const el = document.createElement('div');
      document.body.append(el);
      root = createRoot(el);
      const title = createElement(GameAccountContext.Provider, { value: account },
        createElement(TitleScreen, { onStart: () => {}, onMultiplayer: online ? () => {} : undefined }));
      act(() => root.render(createElement(NextIntlClientProvider, { locale: 'en', messages: en, timeZone: 'UTC', children: title })));
      return [...el.querySelectorAll('.game-mode')].map((b) => b.getAttribute('data-mode'));
    };
    it('shows Free Fly, Story and Multiplayer with accounts, and to guests on a host without them', () => {
      expect(render({ ...NO_ACCOUNT, available: true }, true)).toEqual(['free', 'story', 'multi']);
      act(() => root.unmount());
      expect(render(NO_ACCOUNT, true)).toEqual(['free', 'story', 'multi']);
    });
    it('hides Multiplayer entirely without a realtime service', () => {
      expect(render({ ...NO_ACCOUNT, available: true }, false)).toEqual(['free', 'story']);
    });
  });
});
