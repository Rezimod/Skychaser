/** A numbered section head: the number, the title, a rule to the edge, and one figure at the end of it. */
export default function Chapter({ n, title, aside }: { n: string; title: string; aside?: string }) {
  return (
    <header className="sd-chapter">
      <span className="sd-chapter__n">{n}</span>
      <h2 className="sd-chapter__title">{title}</h2>
      <span className="sd-chapter__rule" aria-hidden="true" />
      {aside && <span className="sd-chapter__aside">{aside}</span>}
    </header>
  );
}
