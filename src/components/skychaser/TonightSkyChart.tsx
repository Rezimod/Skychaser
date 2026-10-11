import type { TonightView } from '@/lib/skychaser/night';

type Candidate = TonightView['voting']['candidates'][number];

const W = 1000;
const H = 380;
const X0 = 48;
const X1 = 984;
const TOP = 28;
const HORIZON = 316;

/**
 * The night drawn as it will happen: each object's altitude from dusk to dawn
 * over Live Telescope V1, the horizon at the foot. The leading card is the lit path; the
 * rest are faint. Objects on the same body — four craters on one Moon — share
 * one path and one label.
 */
export default function TonightSkyChart({
  window,
  candidates,
  lead,
  timezone,
  now,
}: {
  window: { dusk: string; dawn: string };
  candidates: Candidate[];
  lead: string | null;
  timezone: string;
  now: Date;
}) {
  const t0 = Date.parse(window.dusk);
  const t1 = Date.parse(window.dawn);
  const x = (t: number) => X0 + ((t - t0) / (t1 - t0)) * (X1 - X0);
  const y = (alt: number) => HORIZON - (Math.max(-8, alt) / 90) * (HORIZON - TOP);
  const clock = (t: number) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t);

  // One path per body: the same track is the same object.
  const paths = new Map<string, { names: string[]; lead: boolean; c: Candidate }>();
  for (const c of candidates) {
    const key = c.track.map((p) => p.alt).join(',');
    const entry = paths.get(key);
    if (entry) {
      entry.names.push(c.name);
      entry.lead ||= c.designation === lead;
    } else {
      paths.set(key, { names: [c.name], lead: c.designation === lead, c });
    }
  }
  const drawn = [...paths.values()].sort((a, b) => Number(a.lead) - Number(b.lead));

  // Labels sit beside each peak; stacked ones are pushed apart and keep a leader line.
  const labels = drawn
    .map((p) => ({ ...p, px: x(Date.parse(p.c.at)), py: y(p.c.altitudeDeg), ly: y(p.c.altitudeDeg) }))
    .sort((a, b) => a.py - b.py);
  for (let i = 1; i < labels.length; i++) {
    if (Math.abs(labels[i].px - labels[i - 1].px) < 240 && labels[i].ly - labels[i - 1].ly < 24) {
      labels[i].ly = labels[i - 1].ly + 24;
    }
  }

  const hours: number[] = [];
  for (let t = Math.ceil(t0 / 3_600_000) * 3_600_000; t <= t1; t += 3_600_000) hours.push(t);
  const nowT = now.getTime();

  const lit = drawn.find((p) => p.lead);
  const count = `${candidates.length} ${candidates.length === 1 ? 'card' : 'cards'} can be photographed`;
  const summary = lit
    ? `${lit.names.join(', ')} climbs highest to ${lit.c.altitudeDeg.toFixed(0)}° at ${clock(Date.parse(lit.c.at))}. ${count} between ${clock(t0)} and ${clock(t1)}.`
    : `${count} between ${clock(t0)} and ${clock(t1)}.`;

  return (
    <figure className="sd-skychart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
        <defs>
          <linearGradient id="sd-twilight" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#66351d" stopOpacity="0.55" />
            <stop offset="0.18" stopColor="#1b1b1b" stopOpacity="0" />
            <stop offset="0.82" stopColor="#1b1b1b" stopOpacity="0" />
            <stop offset="1" stopColor="#66351d" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="sd-ground" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#0d0d0d" stopOpacity="0.2" />
            <stop offset="1" stopColor="#0d0d0d" stopOpacity="0.95" />
          </linearGradient>
          <clipPath id="sd-above">
            <rect x={X0} y={0} width={X1 - X0} height={HORIZON} />
          </clipPath>
          <filter id="sd-star" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        <rect x={X0} y={TOP - 12} width={X1 - X0} height={HORIZON - TOP + 12} fill="url(#sd-twilight)" />

        {[30, 60, 90].map((a) => (
          <g key={a} className="sd-skychart__grid">
            <line x1={X0} x2={X1} y1={y(a)} y2={y(a)} />
            <text x={X0 - 10} y={y(a) + 4} textAnchor="end">
              {a}°
            </text>
          </g>
        ))}

        <g clipPath="url(#sd-above)">
          {drawn.map((p) => (
            <path
              key={p.names.join()}
              className={p.lead ? 'sd-skychart__path sd-skychart__path--lead' : 'sd-skychart__path'}
              d={p.c.track.map((pt, i) => `${i ? 'L' : 'M'}${x(Date.parse(pt.at)).toFixed(1)},${y(pt.alt).toFixed(1)}`).join(' ')}
            >
              <title>{`${p.names.join(', ')} — highest ${p.c.altitudeDeg.toFixed(0)}° at ${clock(Date.parse(p.c.at))}`}</title>
            </path>
          ))}
        </g>

        <rect x={X0} y={HORIZON} width={X1 - X0} height={H - HORIZON - 30} fill="url(#sd-ground)" />
        <line className="sd-skychart__horizon" x1={X0} x2={X1} y1={HORIZON} y2={HORIZON} />
        <text className="sd-skychart__tick" x={X1} y={HORIZON - 8} textAnchor="end">
          Horizon
        </text>

        {nowT > t0 && nowT < t1 && (
          <g className="sd-skychart__now">
            <line x1={x(nowT)} x2={x(nowT)} y1={TOP - 12} y2={HORIZON} />
            <text x={x(nowT) + 6} y={TOP}>
              Now
            </text>
          </g>
        )}

        {labels.map((l) => {
          const right = l.px < X1 - 230;
          const lx = right ? l.px + 16 : l.px - 16;
          return (
            <g key={l.names.join()} className={l.lead ? 'sd-skychart__peak sd-skychart__peak--lead' : 'sd-skychart__peak'}>
              {l.lead && <circle cx={l.px} cy={l.py} r={10} filter="url(#sd-star)" className="sd-skychart__halo" />}
              <circle cx={l.px} cy={l.py} r={l.lead ? 5 : 4} className="sd-skychart__dot" />
              {l.ly !== l.py && <line x1={l.px} y1={l.py} x2={lx} y2={l.ly} className="sd-skychart__leader" />}
              <text x={lx} y={l.ly + 4} textAnchor={right ? 'start' : 'end'}>
                <tspan className="sd-skychart__name">
                  {l.names.length > 2 ? `Moon · ${l.names.length} cards` : l.names.join(' · ')}
                </tspan>
                <tspan className="sd-skychart__alt" dx={8}>
                  {l.c.altitudeDeg.toFixed(0)}°
                </tspan>
              </text>
            </g>
          );
        })}

        {hours.map((t, i) => (
          <text key={t} className="sd-skychart__tick" x={x(t)} y={H - 8} textAnchor="middle">
            {i % 2 === 0 ? clock(t) : '·'}
          </text>
        ))}
      </svg>
    </figure>
  );
}
