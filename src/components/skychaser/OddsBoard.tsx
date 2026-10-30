'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { RARITIES, rarityInfo, type Rarity } from '@/lib/rarity';
import { TIERS, formatOdds } from '@/lib/skychaser/tiers';

const W = 1000;
const H = 380;
const N = 1000;

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A thousand fixed points in a band across the chart, brightest slots nearest the middle. */
const FIELD = (() => {
  const r = rng(7);
  const pts = Array.from({ length: N }, () => {
    const x = 18 + r() * (W - 36);
    const g = (r() + r() + r() - 1.5) / 1.5;
    const y = H / 2 + (x - W / 2) * -0.12 + g * H * 0.42;
    return { x, y: Math.min(H - 10, Math.max(10, y)), tw: r(), rank: r() };
  });
  // The rarer the slot, the closer to the band's spine it sits.
  const centre = (p: { x: number; y: number }) => Math.abs(p.y - (H / 2 + (p.x - W / 2) * -0.12)) / H + Math.abs(p.x - W / 2) / W / 1.6;
  return pts.map((p) => ({ ...p, score: p.rank * 0.55 + centre(p) })).sort((a, b) => a.score - b.score);
})();

function spikes(x: number, y: number, len: number, w: number) {
  return `M${x} ${y - len}L${x + w} ${y}L${x} ${y + len}L${x - w} ${y}Z M${x - len} ${y}L${x} ${y - w}L${x + len} ${y}L${x} ${y + w}Z`;
}

/** The odds drawn as a sky: one star per capsule in a thousand, coloured by what it opens. */
export default function OddsBoard() {
  const [key, setKey] = useState(TIERS[0].key);
  const tier = TIERS.find((t) => t.key === key)!;

  const stars = useMemo(() => {
    const order: Rarity[] = ['legendary', 'epic', 'rare', 'common'];
    const counts = order.map((r) => Math.round(tier.oddsBps[r] / 10));
    const out: { rarity: Rarity; x: number; y: number; tw: number }[] = [];
    let i = 0;
    order.forEach((rarity, k) => {
      for (let c = 0; c < counts[k] && i < N; c++, i++) out.push({ rarity, ...FIELD[i] });
    });
    return out;
  }, [tier]);

  return (
    <div className="sd-odds">
      <p className="sd-odds__lede">A thousand capsules, as a night sky. Sealed before sale, opened in public.</p>

      <div className="sd-odds__tiers" role="tablist" aria-label="Capsule">
        {TIERS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={t.key === key} className="sd-odds__tier" onClick={() => setKey(t.key)}>
            {t.name}
          </button>
        ))}
      </div>

      <figure className="sd-odds__sky" role="tabpanel" aria-label={`${tier.name} capsule odds`}>
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true" key={key}>
          <defs>
            {RARITIES.map((r) => (
              <radialGradient key={r} id={`sd-halo-${r}`}>
                <stop offset="0" stopColor="#fff" stopOpacity="1" />
                <stop offset=".18" stopColor={rarityInfo(r).color} stopOpacity=".9" />
                <stop offset=".5" stopColor={rarityInfo(r).color} stopOpacity=".18" />
                <stop offset="1" stopColor={rarityInfo(r).color} stopOpacity="0" />
              </radialGradient>
            ))}
            <radialGradient id="sd-band">
              <stop offset="0" stopColor="#8a7bd8" stopOpacity=".12" />
              <stop offset="1" stopColor="#8a7bd8" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx={W / 2} cy={H / 2} rx={W * 0.48} ry={H * 0.26} fill="url(#sd-band)" transform={`rotate(-7 ${W / 2} ${H / 2})`} />
          {stars.map((s, i) => {
            const c = rarityInfo(s.rarity).color;
            const d = `${(s.tw * 4).toFixed(2)}s`;
            if (s.rarity === 'common') return <circle key={i} cx={s.x} cy={s.y} r={0.9 + s.tw * 0.6} fill={c} opacity={0.35 + s.tw * 0.3} />;
            if (s.rarity === 'rare') return <circle key={i} className="sd-odds__tw" style={{ animationDelay: d }} cx={s.x} cy={s.y} r={1.9} fill={c} />;
            if (s.rarity === 'epic')
              return (
                <g key={i} className="sd-odds__tw" style={{ animationDelay: d }}>
                  <circle cx={s.x} cy={s.y} r={9} fill="url(#sd-halo-epic)" />
                  <path d={spikes(s.x, s.y, 9, 0.7)} fill="#e9faff" opacity=".8" />
                </g>
              );
            return (
              <g key={i} className="sd-odds__legend">
                <circle cx={s.x} cy={s.y} r={46} fill="url(#sd-halo-legendary)" />
                <path d={spikes(s.x, s.y, 40, 1.6)} fill="#fff" opacity=".9" />
                <path d={spikes(s.x, s.y, 14, 2.2)} fill="#fff" transform={`rotate(45 ${s.x} ${s.y})`} opacity=".6" />
                <circle cx={s.x} cy={s.y} r={3.2} fill="#fff" />
              </g>
            );
          })}
        </svg>
      </figure>

      <ul className="sd-odds__key">
        {RARITIES.map((r) => (
          <li key={r} data-rarity={r}>
            <i aria-hidden="true" />
            <span>{rarityInfo(r).label}</span>
            <b>{tier.oddsBps[r] === 0 ? '—' : formatOdds(tier.oddsBps[r])}</b>
          </li>
        ))}
      </ul>

      <Link href="/capsules/log" className="sd-odds__log">Read the public log</Link>
    </div>
  );
}
