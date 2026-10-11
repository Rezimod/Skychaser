import { getSunAltitude } from '@/lib/dark-window';
import { siteLocalHours } from '@/lib/observatory/site-time';
import type { ObservatoryNode } from '@/lib/observatory/types';

const W = 1000;
const H = 222;
const TOP = 44;
const BASE = 150;
const STEP_MIN = 10;
const HOUR = 3_600_000;

/** How much daylight is left in the sky at a given Sun altitude: day, the three twilights, night. */
function skyShade(alt: number): number {
  if (alt >= 0) return 0.34;
  if (alt >= -6) return 0.22;
  if (alt >= -12) return 0.12;
  if (alt >= -18) return 0.05;
  return 0;
}

/**
 * The site's day, noon to noon: the sky shaded by the Sun's real altitude,
 * the Sun's path drawn over it, the dark window marked, the operator's hours
 * beneath, and the instants that matter tonight pinned on it.
 */
export default function NightBand({
  node,
  dusk,
  dawn,
  now,
  pins,
}: {
  node: ObservatoryNode;
  dusk: Date;
  dawn: Date;
  now: Date;
  pins: Array<{ at: Date; label: string }>;
}) {
  const start = dusk.getTime() - (siteLocalHours(node.timezone, dusk) - 12) * HOUR;
  const span = 24 * HOUR;
  const x = (t: number) => ((t - start) / span) * W;
  const samples = Array.from({ length: (24 * 60) / STEP_MIN + 1 }, (_, i) => {
    const t = start + i * STEP_MIN * 60_000;
    return { t, alt: getSunAltitude(node.lat, node.lon, new Date(t)) };
  });
  const y = (alt: number) => (TOP + BASE) / 2 - (Math.max(-70, Math.min(70, alt)) / 70) * ((BASE - TOP) / 2 - 4);
  const sunPath = samples.map((s, i) => `${i ? 'L' : 'M'}${x(s.t).toFixed(1)} ${y(s.alt).toFixed(1)}`).join(' ');
  const hourLabel = (t: number) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: node.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(t));

  const avail = node.availability;
  const at = (hours: number) => start + ((hours - 12 + 24) % 24) * HOUR;
  const nowX = now.getTime() >= start && now.getTime() <= start + span ? x(now.getTime()) : null;

  return (
    <figure className="sd-nightband">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`The day under the telescope’s sky, noon to noon. Dark from ${hourLabel(dusk.getTime())} to ${hourLabel(dawn.getTime())}.`}
      >
        <defs>
          <linearGradient id="sd-nightband-sky" x1="0" x2="1">
            {samples.map((s, i) => (
              <stop key={s.t} offset={i / (samples.length - 1)} stopColor="rgb(240, 160, 120)" stopOpacity={skyShade(s.alt)} />
            ))}
          </linearGradient>
        </defs>
        <rect x="0" y={TOP} width={W} height={BASE - TOP} fill="url(#sd-nightband-sky)" />

        <rect
          className="sd-nightband__dark"
          x={x(dusk.getTime())}
          y={TOP}
          width={x(dawn.getTime()) - x(dusk.getTime())}
          height={BASE - TOP}
        />
        <line className="sd-nightband__horizon" x1="0" y1={y(0)} x2={W} y2={y(0)} />
        <path className="sd-nightband__sun" d={sunPath} />

        {[dusk, dawn].map((d, i) => (
          <g key={i} className="sd-nightband__edge">
            <line x1={x(d.getTime())} y1={TOP - 14} x2={x(d.getTime())} y2={BASE} />
            <text x={x(d.getTime())} y={TOP - 20} textAnchor="middle">
              {i ? 'Dawn' : 'Dusk'} {hourLabel(d.getTime())}
            </text>
          </g>
        ))}

        {avail && (
          <g className="sd-nightband__hours">
            <rect
              x={x(at(avail.fromHourLocal))}
              y={BASE + 12}
              width={x(at(avail.toHourLocal)) - x(at(avail.fromHourLocal))}
              height="4"
              rx="2"
            />
            <text x={x(at(avail.fromHourLocal))} y={BASE + 32}>
              Operator hours {String(avail.fromHourLocal).padStart(2, '0')}:00 – {String(avail.toHourLocal).padStart(2, '0')}:00
            </text>
          </g>
        )}

        {pins.map((p) => (
          <g key={p.label} className="sd-nightband__pin">
            <line x1={x(p.at.getTime())} y1={TOP} x2={x(p.at.getTime())} y2={BASE} />
            <path d={`M${x(p.at.getTime())} ${TOP + 8} l5 5 l-5 5 l-5 -5 z`} />
            <text x={x(p.at.getTime()) + 9} y={TOP + 17}>
              {p.label}
            </text>
          </g>
        ))}

        {nowX !== null && (
          <g className="sd-nightband__now">
            <line x1={nowX} y1={TOP} x2={nowX} y2={BASE} />
            <circle cx={nowX} cy={y(getSunAltitude(node.lat, node.lon, now))} r="4" />
            <text x={nowX < 60 ? nowX + 8 : nowX - 8} y={TOP + 16} textAnchor={nowX < 60 ? 'start' : 'end'}>
              Now
            </text>
          </g>
        )}

        <g className="sd-nightband__ticks">
          {Array.from({ length: 9 }, (_, i) => (
            <text key={i} x={(i * W) / 8} y={H - 2} textAnchor={i === 0 ? 'start' : i === 8 ? 'end' : 'middle'}>
              {hourLabel(start + i * 3 * HOUR)}
            </text>
          ))}
        </g>
      </svg>
    </figure>
  );
}
