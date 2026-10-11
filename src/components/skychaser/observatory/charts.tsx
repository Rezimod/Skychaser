import { memo } from 'react';
import type { AltAz } from '@/lib/observatory/safety';
import type { PathPoint, Span } from './sky';

/** A trace of recent readings, newest on the right. */
export function Spark({ values, color, w = 124, h = 26, lo, hi }: { values: number[]; color: string; w?: number; h?: number; lo: number; hi: number }) {
  if (values.length < 2) return <svg width="100%" height={h} aria-hidden="true" />;
  const y = (v: number) => h - 2 - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (h - 4);
  const pts = values.map((v, i) => `${((i * w) / (values.length - 1)).toFixed(1)},${y(v).toFixed(1)}`);
  const last = pts[pts.length - 1].split(',');
  const id = `sp${color.replace('#', '')}${w}`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M0,${h} L${pts.join(' L')} L${w},${h} Z`} fill={`url(#${id})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={color} />
    </svg>
  );
}

/** Altitude from dusk to dawn, the horizon dashed, now as an amber line. */
export function AltCurve({ path, span, now, color = '#f0785a', w = 150, h = 34 }: { path: PathPoint[]; span: Span; now: number; color?: string; w?: number; h?: number }) {
  const x = (t: number) => ((t - span.start) / (span.end - span.start)) * w;
  const y = (alt: number) => h - 3 - (Math.max(-8, alt) / 90) * (h - 6);
  const nowX = Math.min(w, Math.max(0, x(now)));
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <line x1="0" y1={h - 3} x2={w} y2={h - 3} stroke="rgba(255, 255, 255, .25)" strokeDasharray="2 3" />
      <polyline points={path.map((p) => `${x(p.t).toFixed(1)},${y(p.altitude).toFixed(1)}`).join(' ')} fill="none" stroke={color} strokeWidth="1.5" />
      <line x1={nowX} y1="0" x2={nowX} y2={h} stroke="#b8321f" strokeWidth="1" />
    </svg>
  );
}

const R = 62;
const polar = (alt: number, az: number) => {
  const r = R * (1 - Math.max(0, alt) / 90);
  const a = (az * Math.PI) / 180;
  return [70 + r * Math.sin(a), 70 - r * Math.cos(a)] as const;
};

/** The sky from above: horizon at the rim, zenith at the centre, the target's path tonight and where the tube points. */
function DialBase({ path, pointing }: { path: PathPoint[] | null; pointing: AltAz | null }) {
  const ticks = Array.from({ length: 72 }, (_, i) => {
    const a = (i * 5 * Math.PI) / 180;
    const L = i % 18 === 0 ? 6 : 3;
    return <line key={i} x1={70 + R * Math.sin(a)} y1={70 - R * Math.cos(a)} x2={70 + (R - L) * Math.sin(a)} y2={70 - (R - L) * Math.cos(a)} stroke="rgba(244, 244, 242, .35)" strokeWidth=".7" />;
  });
  const up = path?.filter((p) => p.altitude > 0) ?? [];
  const at = pointing ? polar(pointing.altitude, pointing.azimuth) : null;
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Pointing: altitude and azimuth">
      <defs>
        <radialGradient id="sdo-dg" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#16161c" />
          <stop offset="1" stopColor="#060609" />
        </radialGradient>
      </defs>
      <circle cx="70" cy="70" r={R} fill="url(#sdo-dg)" stroke="rgba(255, 255, 255, .35)" />
      {[41, 21].map((r) => (
        <circle key={r} cx="70" cy="70" r={r} fill="none" stroke="rgba(255, 255, 255, .16)" strokeDasharray="2 3" />
      ))}
      {ticks}
      {(['N', 'E', 'S', 'W'] as const).map((t, i) => {
        const a = (i * 90 * Math.PI) / 180;
        return (
          <text key={t} x={70 + (R - 13) * Math.sin(a)} y={70 - (R - 13) * Math.cos(a)} textAnchor="middle" dominantBaseline="middle" fill={t === 'N' ? '#b8321f' : 'rgba(244, 244, 242, .6)'} style={{ font: '600 10px var(--o-cond)' }}>
            {t}
          </text>
        );
      })}
      {up.length > 1 && (
        <polyline points={up.map((p) => polar(p.altitude, p.azimuth).map((v) => v.toFixed(1)).join(',')).join(' ')} fill="none" stroke="#f0785a" strokeWidth="1.3" strokeDasharray="3 3" />
      )}
      {at && (
        <>
          <line x1="70" y1="70" x2={at[0]} y2={at[1]} stroke="rgba(226, 184, 90, .55)" />
          <circle cx={at[0]} cy={at[1]} r="5" fill="none" stroke="#e2b85a" strokeWidth="1.5" />
          <circle cx={at[0]} cy={at[1]} r="1.8" fill="#e2b85a" />
        </>
      )}
      <circle cx="70" cy="70" r="1.6" fill="rgba(244, 244, 242, .8)" />
    </svg>
  );
}

export const Dial = memo(DialBase);
