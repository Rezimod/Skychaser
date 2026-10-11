/**
 * The poster's sunburst: fine gold rays fanned out from a point, uneven in
 * length the way a hand-cut screenprint is. Drawn once as SVG, centred on its
 * box, and faded at the rim by the stylesheet (.sd-burst). The lengths come
 * from a fixed seed, so the server and the browser draw the same rays.
 */
const RAYS = (() => {
  let s = 57;
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const out: { x1: number; y1: number; x2: number; y2: number; w: number; o: number }[] = [];
  const n = 84;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.03;
    const r0 = 150 + rand() * 30;
    const r1 = r0 + (i % 3 === 0 ? 300 : 180) + rand() * 200;
    out.push({
      x1: Math.cos(a) * r0, y1: Math.sin(a) * r0,
      x2: Math.cos(a) * r1, y2: Math.sin(a) * r1,
      w: i % 2 ? 1.4 : 2.2,
      o: 0.45 + rand() * 0.45,
    });
  }
  return out;
})();

export default function Sunburst({ className = '' }: { className?: string }) {
  return (
    <svg className={`sd-burst ${className}`.trim()} viewBox="-700 -700 1400 1400" aria-hidden="true" focusable="false">
      {RAYS.map((r, i) => (
        <line
          key={i}
          x1={r.x1.toFixed(1)} y1={r.y1.toFixed(1)} x2={r.x2.toFixed(1)} y2={r.y2.toFixed(1)}
          strokeWidth={r.w} strokeOpacity={r.o.toFixed(2)} strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
