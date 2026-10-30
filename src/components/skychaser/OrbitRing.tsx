/**
 * Worlds of the set orbiting the Sun, passing behind it on the far side. Only
 * translate, transform and opacity animate, so the compositor does the work.
 */
export default function OrbitRing({ designations }: { designations: string[] }) {
  return (
    <div className="sd-orbit__stage" aria-hidden="true">
      <div className="sd-orbit__path" />
      <div className="sd-orbit__sun">
        <span className="sd-orbit__corona" />
        <img src="/sky/targets/sun-480.webp" alt="" width={480} height={458} loading="lazy" decoding="async" />
      </div>
      <ul className="sd-orbit__ring" style={{ '--n': designations.length } as React.CSSProperties}>
        {designations.map((d, i) => (
          <li key={d} className="sd-orbit__body" style={{ '--k': i } as React.CSSProperties}>
            <img src={`/cards/art/sm/${d}.webp`} alt="" width={440} height={584} loading="lazy" decoding="async" />
          </li>
        ))}
      </ul>
    </div>
  );
}
