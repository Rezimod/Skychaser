import { planetsTonight } from '@/lib/skychaser/planets-tonight';

const time = (d: Date) => d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Tbilisi', hour: '2-digit', minute: '2-digit' });
const day = (d: Date) => d.toLocaleDateString('en-GB', { timeZone: 'Asia/Tbilisi', weekday: 'short', day: 'numeric', month: 'short' });

/** Which planets clear 10° in a dark sky over Tbilisi tonight, worked out from their real positions. */
export default function PlanetsTonight() {
  const { start, end, planets } = planetsTonight();
  const live = Math.abs(Date.now() - start.getTime()) < 60_000;
  const edge = (d: Date) => (d.getTime() === start.getTime() ? (live ? 'now' : 'dusk') : end.getTime() - d.getTime() < 15 * 60_000 ? 'dawn' : time(d));

  return (
    <section className="sd-container sd-tonight" aria-labelledby="tonight-title">
      <header className="sd-tonight__head">
        <h2 id="tonight-title">Planets tonight</h2>
        <span>Tbilisi · {day(start)} · {live ? 'dark now' : `dark from ${time(start)}`} until {time(end)}</span>
      </header>
      {planets.length === 0 ? (
        <p className="sd-tonight__none">No planets clear the horizon in a dark sky tonight.</p>
      ) : (
        <ul className="sd-tonight__list">
          {planets.map((p) => (
            <li key={p.name} data-planet={p.name.toLowerCase()}>
              <i aria-hidden="true" />
              <strong>{p.name}</strong>
              <span>{edge(p.from)}–{edge(p.to)}</span>
              <span className="sd-tonight__best">best {end.getTime() - p.best.getTime() < 15 * 60_000 ? 'before dawn' : time(p.best)} · {p.alt}° {p.dir}</span>
              <em>{p.scope ? 'Telescope' : 'Naked eye'}</em>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
