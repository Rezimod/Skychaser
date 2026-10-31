import type { CSSProperties, ReactNode } from 'react';
import { planetsTonight, type TonightPlanet } from '@/lib/skychaser/planets-tonight';

const time = (d: Date) => d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Tbilisi', hour: '2-digit', minute: '2-digit' });
const day = (d: Date) => d.toLocaleDateString('en-GB', { timeZone: 'Asia/Tbilisi', weekday: 'short', day: 'numeric', month: 'short' });

const W = 1000;
const H = 310;
const X0 = 44;
const X1 = 956;
const GROUND = 252;
const altY = (alt: number) => GROUND - (Math.max(0, alt) / 80) * 200;

const COLORS: Record<string, [string, string]> = {
  Mercury: ['#d6cfc4', '#8a8178'],
  Venus: ['#fbefc6', '#d7b46a'],
  Mars: ['#f08a5d', '#a8361c'],
  Jupiter: ['#f1d6b0', '#c08756'],
  Saturn: ['#f6e6b4', '#c7a35c'],
  Uranus: ['#d6fbfb', '#79c9d2'],
  Neptune: ['#8fb0ff', '#3550c8'],
};
const RADIUS: Record<string, number> = { Mercury: 8, Venus: 12, Mars: 11, Jupiter: 20, Saturn: 15, Uranus: 12, Neptune: 12 };

/** One planet drawn flat and lit from the upper left, with its own markings. */
function Planet({ name, x, y }: { name: string; x: number; y: number }) {
  const id = `sd-pl-${name.toLowerCase()}`;
  const r = RADIUS[name];
  const disc = (marks?: ReactNode) => (
    <>
      <circle cx={x} cy={y} r={r * 2.6} fill={`url(#${id}-glow)`} />
      <circle cx={x} cy={y} r={r} fill={`url(#${id})`} />
      {marks && <g clipPath={`url(#${id}-clip)`}>{marks}</g>}
      <circle cx={x} cy={y} r={r} fill="url(#sd-pl-shade)" />
    </>
  );
  switch (name) {
    case 'Saturn':
      return (
        <g transform={`rotate(-16 ${x} ${y})`}>
          <path d={`M${x - 34} ${y}A34 9 0 0 1 ${x + 34} ${y}`} fill="none" stroke="#c9b27a" strokeWidth={5} opacity={0.6} />
          {disc(<><rect x={x - r} y={y - 5} width={r * 2} height={3} fill="#b89a5c" opacity=".55" /><rect x={x - r} y={y + 4} width={r * 2} height={2} fill="#a88a4e" opacity=".45" /></>)}
          <path d={`M${x - 34} ${y}A34 9 0 0 0 ${x + 34} ${y}`} fill="none" stroke="#efdeaa" strokeWidth={5} />
          <path d={`M${x - 34} ${y}A34 9 0 0 0 ${x + 34} ${y}`} fill="none" stroke="#1a1410" strokeWidth={0.8} opacity=".6" />
        </g>
      );
    case 'Jupiter':
      return (
        <g>
          {disc(<>
            {[-12, -5, 2, 9].map((o, i) => <rect key={o} x={x - r} y={y + o} width={r * 2} height={i % 2 ? 3 : 4} fill={i % 2 ? '#a26a45' : '#c48a5c'} opacity=".8" />)}
            <ellipse cx={x + 7} cy={y + 6} rx={4} ry={2.4} fill="#b4513a" />
          </>)}
        </g>
      );
    case 'Mars':
      return <g>{disc(<><path d={`M${x - r} ${y + 2}q6 -5 12 0t10 -2`} stroke="#7c2f1a" strokeWidth={3} fill="none" opacity=".6" /><ellipse cx={x} cy={y - r + 1} rx={5} ry={2} fill="#fff" opacity=".85" /></>)}</g>;
    case 'Uranus':
      return (
        <g>
          {disc()}
          <ellipse cx={x} cy={y} rx={4} ry={21} fill="none" stroke="#bdeff2" strokeWidth={1.2} opacity={0.5} transform={`rotate(8 ${x} ${y})`} />
        </g>
      );
    case 'Neptune':
      return <g>{disc(<><path d={`M${x - r} ${y - 3}h${r * 2}`} stroke="#2c45b0" strokeWidth={2} opacity=".6" /><ellipse cx={x - 3} cy={y + 3} rx={3} ry={1.6} fill="#1c2b78" /></>)}</g>;
    case 'Venus':
      return <g>{disc(<path d={`M${x - r} ${y - 2}q8 -4 24 1`} stroke="#fff6d8" strokeWidth={3} fill="none" opacity=".5" />)}</g>;
    default:
      return <g>{disc(<><circle cx={x - 2} cy={y - 2} r={1.6} fill="#6d665e" /><circle cx={x + 3} cy={y + 2} r={1.1} fill="#6d665e" /></>)}</g>;
  }
}

/** Which planets clear 10° in a dark sky over Tbilisi tonight, drawn on a chart of the night. */
export default function PlanetsTonight() {
  const { start, end, planets } = planetsTonight();
  const live = Math.abs(Date.now() - start.getTime()) < 60_000;
  const span = end.getTime() - start.getTime();
  const tx = (t: number) => X0 + ((t - start.getTime()) / span) * (X1 - X0);
  const edge = (d: Date) => (d.getTime() === start.getTime() ? (live ? 'now' : 'dusk') : end.getTime() - d.getTime() < 15 * 60_000 ? 'dawn' : time(d));

  const hours: number[] = [];
  for (let t = Math.ceil(start.getTime() / 3_600_000) * 3_600_000; t < end.getTime() - 20 * 60_000; t += 3_600_000) hours.push(t);

  const STEP = 10 * 60_000;
  const at = (i: number) => tx(start.getTime() + i * STEP);
  const track = (p: TonightPlanet) => {
    let d = '';
    let pen = false;
    p.track.forEach((alt, i) => {
      if (alt <= 0) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${at(i).toFixed(1)} ${altY(alt).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  // Each planet sits at its highest point unless another is already there; then it slides along its own path.
  const placed: { name: string; x: number; y: number; r: number }[] = [];
  for (const p of [...planets].sort((a, b) => RADIUS[b.name] - RADIUS[a.name])) {
    const best = p.track.indexOf(Math.max(...p.track));
    const order = p.track.map((_, i) => i).filter((i) => p.track[i] >= 10).sort((a, b) => Math.abs(a - best) - Math.abs(b - best));
    const r = RADIUS[p.name] + (p.name === 'Saturn' ? 14 : 0);
    const free = (i: number) => placed.every((q) => Math.hypot(at(i) - q.x, altY(p.track[i]) - q.y) > r + q.r + 46);
    const i = order.find(free) ?? best;
    placed.push({ name: p.name, x: at(i), y: altY(p.track[i]), r });
  }
  const spot = (name: string) => placed.find((q) => q.name === name)!;

  return (
    <section className="sd-container sd-tonight" aria-labelledby="tonight-title">
      <header className="sd-tonight__head">
        <h2 id="tonight-title">Planets tonight</h2>
        <span>Tbilisi · {day(start)} · {live ? 'dark now' : `dark from ${time(start)}`} until {time(end)}</span>
      </header>

      {planets.length === 0 ? (
        <p className="sd-tonight__none">No planets clear the horizon in a dark sky tonight.</p>
      ) : (
        <>
          <svg className="sd-tonight__chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Planets over Tbilisi tonight: ${planets.map((p) => p.name).join(', ')}`}>
            <defs>
              <linearGradient id="sd-tn-sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#14163a" stopOpacity="0" />
                <stop offset="1" stopColor="#2a2350" stopOpacity=".5" />
              </linearGradient>
              <radialGradient id="sd-pl-shade" cx=".3" cy=".3" r=".9">
                <stop offset=".45" stopColor="#000" stopOpacity="0" />
                <stop offset="1" stopColor="#000" stopOpacity=".75" />
              </radialGradient>
              {planets.map((p) => {
                const [a, b] = COLORS[p.name];
                const id = `sd-pl-${p.name.toLowerCase()}`;
                return (
                  <g key={id}>
                    <radialGradient id={id} cx=".35" cy=".3" r=".8">
                      <stop offset="0" stopColor="#fff" stopOpacity=".9" />
                      <stop offset=".25" stopColor={a} />
                      <stop offset="1" stopColor={b} />
                    </radialGradient>
                    <radialGradient id={`${id}-glow`}>
                      <stop offset="0" stopColor={a} stopOpacity=".3" />
                      <stop offset="1" stopColor={a} stopOpacity="0" />
                    </radialGradient>
                    <clipPath id={`${id}-clip`}>
                      <circle cx={spot(p.name).x} cy={spot(p.name).y} r={RADIUS[p.name]} />
                    </clipPath>
                  </g>
                );
              })}
            </defs>

            <rect x={X0} y={20} width={X1 - X0} height={GROUND - 20} fill="url(#sd-tn-sky)" />
            {[30, 60].map((a) => (
              <g key={a}>
                <line x1={X0} x2={X1} y1={altY(a)} y2={altY(a)} className="sd-tonight__grid" />
                <text x={X0 - 8} y={altY(a) + 4} textAnchor="end" className="sd-tonight__tick">{a}°</text>
              </g>
            ))}
            {hours.map((t) => (
              <g key={t}>
                <line x1={tx(t)} x2={tx(t)} y1={GROUND} y2={GROUND + 6} className="sd-tonight__axis" />
                <text x={tx(t)} y={GROUND + 24} textAnchor="middle" className="sd-tonight__tick">{time(new Date(t)).slice(0, 2)}</text>
              </g>
            ))}
            <line x1={X0} x2={X1} y1={GROUND} y2={GROUND} className="sd-tonight__axis" />
            <text x={X0} y={GROUND + 48} className="sd-tonight__edge">{live ? 'Now' : 'Dusk'}</text>
            <text x={X1} y={GROUND + 48} textAnchor="end" className="sd-tonight__edge">Dawn</text>

            {planets.map((p) => (
              <path key={p.name} d={track(p)} className="sd-tonight__track" stroke={COLORS[p.name][0]} />
            ))}
            {planets.map((p) => {
              const { x, y } = spot(p.name);
              const r = RADIUS[p.name];
              const flip = x > X1 - 70;
              return (
                <g key={p.name} className="sd-tonight__planet">
                  <Planet name={p.name} x={x} y={y} />
                  <text x={flip ? x + r : x} y={flip ? y + r + 26 : y - r - 14} textAnchor={flip ? 'end' : 'middle'} className="sd-tonight__name">{p.name}</text>
                </g>
              );
            })}
          </svg>

          <ul className="sd-tonight__list">
            {planets.map((p) => (
              <li key={p.name} style={{ '--p': COLORS[p.name][0] } as CSSProperties}>
                <i aria-hidden="true" />
                <strong>{p.name}</strong>
                <span>{edge(p.from)}–{edge(p.to)}<b> · highest {p.alt}° {p.dir}</b></span>
                <em>{p.scope ? 'Telescope' : 'Naked eye'}</em>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
