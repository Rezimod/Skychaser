import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { earthOrientation, skyFrame } from '@/lib/solar-system/moon-sky';
import { BRIGHT_STARS } from '@/lib/sky/stars';

const DEG = 180 / Math.PI;
const star = (id: string, frame: ReturnType<typeof skyFrame>) => {
  const s = BRIGHT_STARS.find((x) => x.id === id)!;
  const a = s.ra * 15 / DEG; const d = s.dec / DEG;
  const e = 23.4393 / DEG;
  const x = Math.cos(d) * Math.cos(a); const y = Math.cos(d) * Math.sin(a); const z = Math.sin(d);
  return frame.fromEcliptic(x, y * Math.cos(e) + z * Math.sin(e), -y * Math.sin(e) + z * Math.cos(e), new THREE.Vector3());
};

describe('the sky over Stellar Base', () => {
  it('keeps Earth low in the north all year, drifting with the libration', () => {
    let lo = 90; let hi = -90;
    for (let day = 0; day < 365; day += 3) {
      const f = skyFrame(new Date(Date.UTC(2026, 0, 1) + day * 864e5));
      const elev = Math.asin(f.earthDir.y) * DEG;
      lo = Math.min(lo, elev); hi = Math.max(hi, elev);
      // North is -Z: Earth is over the base as seen from the pad.
      expect(f.earthDir.z).toBeLessThan(-0.85);
    }
    expect(lo).toBeGreaterThan(3);
    expect(hi).toBeLessThan(26);
    // It really moves: the libration swings it several degrees.
    expect(hi - lo).toBeGreaterThan(8);
  });

  it('draws Earth about two degrees across', () => {
    const d = skyFrame(new Date(Date.UTC(2026, 8, 19))).earthDiameterDeg;
    expect(d).toBeGreaterThan(1.8);
    expect(d).toBeLessThan(2.1);
  });

  it('keeps the angles between stars (Betelgeuse to Rigel, 18.6 degrees)', () => {
    const f = skyFrame(new Date(Date.UTC(2026, 3, 2)));
    const sep = star('betelgeuse', f).angleTo(star('rigel', f)) * DEG;
    expect(sep).toBeCloseTo(18.6, 0);
  });

  it('puts the Sun over the Tropic of Cancer at the June solstice', () => {
    const f = skyFrame(new Date(Date.UTC(2026, 5, 21, 12)));
    expect(f.subsolar.lat).toBeGreaterThan(23.2);
    // Noon UTC: the Sun is near the Greenwich meridian (the equation of time is small).
    expect(Math.abs(f.subsolar.lon)).toBeLessThan(3);
  });

  it('turns the day side of Earth to the scene sun, pole on its axis', () => {
    const f = skyFrame(new Date(Date.UTC(2026, 2, 20, 12)));
    const sun = new THREE.Vector3(-0.62, 0.3, 0.72).normalize();
    const q = earthOrientation(f, sun, new THREE.Quaternion());
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(q).angleTo(f.earthAxis)).toBeLessThan(1e-6);
    // At the equinox the subsolar point is on the equator, so it faces the sun's
    // direction as nearly as the pole allows.
    const p = f.subsolar.lat / DEG; const l = f.subsolar.lon / DEG;
    const sub = new THREE.Vector3(Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l)).applyQuaternion(q);
    expect(sub.angleTo(sun)).toBeLessThan(Math.abs(Math.PI / 2 - sun.angleTo(f.earthAxis)) + 0.02);
  });
});
