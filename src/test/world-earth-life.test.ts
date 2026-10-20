// Tbilisi's life: the car you drive, the traffic that keeps its distance, the
// crowd that comes to meet the lander, and the lander lifting off again.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { makeLander } from '@/lib/solar-system/moon-lander';
import type { DustHandle } from '@/lib/solar-system/moon-fx';
import { EARTH_DESCENT } from '@/lib/solar-system/world-earth';
import { WORLDS } from '@/lib/solar-system/world-profiles';
import { makeHeightAt, parseCity, parseTerrain, type EarthData, type Manifest } from '@/lib/solar-system/world-earth-data';
import { makeCar, type CarWorld } from '@/lib/solar-system/world-earth-car';
import { makeTraffic } from '@/lib/solar-system/world-earth-traffic';
import { makePeople, type Mover } from '@/lib/solar-system/world-earth-people';

const flat = () => 0;
const DT = 1 / 120;
const dust: DustHandle = { points: new THREE.Points(), burst: vi.fn(), setCap: vi.fn(), update: vi.fn(), dispose: vi.fn() };
const open: CarWorld = { floorAt: flat, pushOut: () => false, isWater: () => false, colliders: () => [] };
const run = (seconds: number, step: () => void) => { for (let i = 0; i < seconds / DT; i++) step(); };

describe('the lander lifts off', () => {
  it('climbs away under a full g once launched, and only once down', () => {
    const lander = makeLander(0, 0, flat, dust, true, undefined, WORLDS.earth.gravity, EARTH_DESCENT);
    lander.launch();
    expect(lander.telemetry.climb).toBe(-1);
    for (let i = 0; i < 60 * 120 && !lander.telemetry.landed; i++) lander.update(1 / 60, { throttle: 0, moveX: 0, moveY: 0 }, flat);
    expect(lander.telemetry.landed).toBe(true);
    lander.launch();
    for (let i = 0; i < 60 * 12 && lander.telemetry.climb <= 7.5; i++) lander.update(1 / 60, { throttle: 0, moveX: 0, moveY: 0 }, flat);
    expect(lander.telemetry.climb).toBeGreaterThan(7.5);
    expect(lander.telemetry.altitude).toBeGreaterThan(30);
  });
});

describe('the car', () => {
  it('drives forward along its heading, and brakes to a stop', () => {
    const car = makeCar(0, 0, 0, flat, true);
    run(6, () => car.update(DT, { throttle: 1, steer: 0, handbrake: false }, open, 0));
    expect(car.speed).toBeGreaterThan(15);
    expect(car.speed).toBeLessThanOrEqual(34.5);
    expect(car.position.z).toBeGreaterThan(40);
    expect(Math.abs(car.position.x)).toBeLessThan(1);
    run(6, () => car.update(DT, { throttle: -1, steer: 0, handbrake: false }, open, 0));
    expect(car.speed).toBeLessThanOrEqual(0.5);
    car.dispose();
  });

  it('turns when steered, and does not turn standing still', () => {
    const still = makeCar(0, 0, 0, flat, true);
    run(2, () => still.update(DT, { throttle: 0, steer: 1, handbrake: false }, open, 0));
    expect(Math.abs(still.yaw)).toBeLessThan(0.01);
    const car = makeCar(0, 0, 0, flat, true);
    run(2, () => car.update(DT, { throttle: 1, steer: 0, handbrake: false }, open, 0));
    run(2, () => car.update(DT, { throttle: 0.5, steer: 1, handbrake: false }, open, 0));
    expect(Math.abs(car.yaw)).toBeGreaterThan(0.3);
    still.dispose(); car.dispose();
  });

  it('does not drive into the river', () => {
    const car = makeCar(0, 0, 0, flat, true);
    const wet: CarWorld = { ...open, isWater: (_x, z) => z > 20 };
    run(8, () => car.update(DT, { throttle: 1, steer: 0, handbrake: false }, wet, 0));
    expect(car.position.z).toBeLessThan(22);
    car.dispose();
  });
});

describe('the city in motion', () => {
  let data: EarthData;
  beforeAll(() => {
    const dir = path.resolve(__dirname, '../../public/explore/tbilisi');
    const buf = (f: string) => { const b = readFileSync(path.join(dir, f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
    const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as Manifest;
    data = { manifest, grids: parseTerrain(buf('terrain.bin')), ...parseCity(buf('city.bin')) };
  });

  it('traffic runs on the roads around the crew, at city speeds', () => {
    const heightAt = makeHeightAt(data.grids);
    const traffic = makeTraffic(data, true);
    run(20, () => traffic.update(DT, 0, 0, [], 0, heightAt));
    const cars = traffic.movers(0, 0, 700, []);
    expect(cars.length).toBeGreaterThan(10);
    expect(cars.length).toBeLessThanOrEqual(30);
    for (const c of cars) expect(Math.hypot(c.vx, c.vz)).toBeLessThan(25);
    traffic.dispose();
  });

  it('a car stops for someone standing in the road', () => {
    const heightAt = makeHeightAt(data.grids);
    const traffic = makeTraffic(data, true);
    run(10, () => traffic.update(DT, 0, 0, [], 0, heightAt));
    const moving = traffic.movers(0, 0, 700, []).find((c) => Math.hypot(c.vx, c.vz) > 6)!;
    expect(moving).toBeDefined();
    const v = Math.hypot(moving.vx, moving.vz);
    const person: Mover = { x: moving.x + (moving.vx / v) * 14, z: moving.z + (moving.vz / v) * 14, vx: 0, vz: 0, r: 0.4 };
    let closest = Infinity;
    run(6, () => {
      traffic.update(DT, 0, 0, [person], 0, heightAt);
      for (const c of traffic.movers(person.x, person.z, 6, [])) closest = Math.min(closest, Math.hypot(c.x - person.x, c.z - person.z) - c.r);
    });
    expect(closest).toBeGreaterThan(0.4);
    traffic.dispose();
  });

  it('hands back the same circles every query, so nothing is allocated a frame', () => {
    const heightAt = makeHeightAt(data.grids);
    const traffic = makeTraffic(data, true);
    run(10, () => traffic.update(DT, 0, 0, [], 0, heightAt));
    const out: Mover[] = [];
    const first = [...traffic.movers(0, 0, 700, out)];
    expect(first.length).toBeGreaterThan(0);
    traffic.update(DT, 0, 0, [], 0, heightAt);
    const second = traffic.movers(0, 0, 700, out);
    expect(second).toBe(out);
    for (const m of second) expect(first).toContain(m);
    traffic.dispose();
    const people = makePeople(data, { floorAt: heightAt, blocked: () => false }, true);
    const pad = data.manifest.pad;
    people.welcome(pad.x, pad.z, pad.x + 10, pad.z);
    run(5, () => people.update(DT, pad.x + 10, pad.z, []));
    const a = [...people.colliders(pad.x, pad.z, 60, out)];
    people.update(DT, pad.x + 10, pad.z, []);
    const b = people.colliders(pad.x, pad.z, 60, out);
    expect(a.length).toBeGreaterThan(0);
    for (const m of b) expect(a).toContain(m);
    people.dispose();
  });

  it('a crowd gathers round the lander and cheers, then goes about its day', () => {
    const heightAt = makeHeightAt(data.grids);
    const people = makePeople(data, { floorAt: heightAt, blocked: () => false }, true);
    const pad = data.manifest.pad;
    const [px, pz] = [pad.x, pad.z];
    people.welcome(px, pz, px + 10, pz);
    run(40, () => people.update(DT, px + 10, pz, []));
    expect(people.cheering()).toBeGreaterThan(0.5);
    expect(people.colliders(px + 10, pz, 30, []).length).toBeGreaterThanOrEqual(12);
    run(40, () => people.update(DT, px + 200, pz, []));
    expect(people.cheering()).toBeLessThan(0.2);
    people.dispose();
  });
});
