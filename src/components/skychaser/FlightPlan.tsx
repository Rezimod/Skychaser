import Link from 'next/link';

type Step = {
  title: string;
  text: string;
  /** Open now; the rest are coming soon. */
  live: boolean;
  href?: string;
  /** A short note for a live step, such as its price. */
  tag?: string;
};

/** What a card opens: four plain steps, the live one linked, the rest marked coming soon. */
export default function FlightPlan({ steps }: { steps: Step[] }) {
  return (
    <ol className="sd-flight">
      {steps.map((s) => {
        const body = (
          <>
            <span className="sd-flight__title">{s.title}</span>
            <span className="sd-flight__text">{s.text}</span>
            <span className="sd-flight__tag">{s.live ? (s.tag ?? 'Open now') : 'Coming soon'}</span>
          </>
        );
        return (
          <li key={s.title} className={s.live ? 'is-live' : undefined}>
            {s.live && s.href ? (
              <Link href={s.href} className="sd-flight__step">
                {body}
              </Link>
            ) : (
              <div className="sd-flight__step">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export type { Step as FlightStep };
