/** A section head: the title, a rule to the edge, and one figure at the end of it. */
export default function Chapter({ title, aside }: { title: string; aside?: string }) {
  return (
    <header className="sd-chapter">
      <h2 className="sd-chapter__title">{title}</h2>
      <span className="sd-chapter__rule" aria-hidden="true" />
      {aside && <span className="sd-chapter__aside">{aside}</span>}
    </header>
  );
}
