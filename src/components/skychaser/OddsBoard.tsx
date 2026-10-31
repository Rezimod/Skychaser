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

/** Thin diffraction glints, fading to nothing at the tips, as a telescope draws a bright star. */
function Glints({ x, y, len, w, rot = 0, o = 1 }: { x: number; y: number; len: number; w: number; rot?: number; o?: number }) {
  return (
    <g transform={`rotate(${rot} ${x} ${y})`} opacity={o}>
      <rect x={x - len} y={y - w / 2} width={len * 2} height={w} fill="url(#sd-glint-h)" />
      <rect x={x - w / 2} y={y - len} width={w} height={len * 2} fill="url(#sd-glint-v)" />
    </g>
  );
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
        <svg className="sd-odds__dust" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" preserveAspectRatio="none">
          <defs>
            <filter id="sd-dust" x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency=".004 .012" numOctaves="5" seed="11" />
              <feColorMatrix values="0 0 0 0 .55  0 0 0 0 .42  0 0 0 0 .78  0 0 0 1.6 -.55" />
            </filter>
            <filter id="sd-lanes" x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency=".008 .03" numOctaves="4" seed="3" />
              <feColorMatrix values="0 0 0 0 .04  0 0 0 0 .03  0 0 0 0 .05  0 0 0 2.2 -1.1" />
            </filter>
            <radialGradient id="sd-band-mask" cx=".5" cy=".5" r=".5">
              <stop offset="0" stopColor="#fff" />
              <stop offset=".55" stopColor="#fff" stopOpacity=".55" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <mask id="sd-band-m">
              <ellipse cx={W / 2} cy={H / 2} rx={W * 0.5} ry={H * 0.34} fill="url(#sd-band-mask)" transform={`rotate(-7 ${W / 2} ${H / 2})`} />
            </mask>
            <radialGradient id="sd-core">
              <stop offset="0" stopColor="#f3d9a8" stopOpacity=".22" />
              <stop offset=".5" stopColor="#b98bd6" stopOpacity=".08" />
              <stop offset="1" stopColor="#5b4aa8" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g mask="url(#sd-band-m)">
            <rect width={W} height={H} filter="url(#sd-dust)" opacity=".75" />
            <ellipse cx={W / 2} cy={H / 2} rx={W * 0.3} ry={H * 0.22} fill="url(#sd-core)" transform={`rotate(-7 ${W / 2} ${H / 2})`} />
            <rect width={W} height={H} filter="url(#sd-lanes)" opacity=".85" />
          </g>
        </svg>
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true" key={key}>
          <defs>
            {RARITIES.map((r) => (
              <radialGradient key={r} id={`sd-halo-${r}`}>
                <stop offset="0" stopColor="#fff" stopOpacity="1" />
                <stop offset=".08" stopColor="#fff" stopOpacity=".9" />
                <stop offset=".22" stopColor={rarityInfo(r).color} stopOpacity=".45" />
                <stop offset=".55" stopColor={rarityInfo(r).color} stopOpacity=".08" />
                <stop offset="1" stopColor={rarityInfo(r).color} stopOpacity="0" />
              </radialGradient>
            ))}
            <linearGradient id="sd-glint-h">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset=".5" stopColor="#fff" stopOpacity=".95" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="sd-glint-v" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset=".5" stopColor="#fff" stopOpacity=".95" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
          </defs>
          {stars.map((s, i) => {
            const c = rarityInfo(s.rarity).color;
            const d = `${(s.tw * 4).toFixed(2)}s`;
            if (s.rarity === 'common') return <circle key={i} cx={s.x} cy={s.y} r={0.55 + s.tw * 0.55} fill={c} opacity={0.3 + s.tw * 0.35} />;
            if (s.rarity === 'rare')
              return (
                <g key={i} className="sd-odds__tw" style={{ animationDelay: d }}>
                  <circle cx={s.x} cy={s.y} r={5} fill="url(#sd-halo-rare)" />
                  <circle cx={s.x} cy={s.y} r={0.9} fill="#fff" />
                </g>
              );
            if (s.rarity === 'epic')
              return (
                <g key={i} className="sd-odds__tw" style={{ animationDelay: d }}>
                  <circle cx={s.x} cy={s.y} r={14} fill="url(#sd-halo-epic)" />
                  <Glints x={s.x} y={s.y} len={11} w={0.6} o={0.7} />
                  <circle cx={s.x} cy={s.y} r={1.3} fill="#fff" />
                </g>
              );
            return (
              <g key={i} className="sd-odds__legend">
                <circle cx={s.x} cy={s.y} r={70} fill="url(#sd-halo-legendary)" />
                <circle cx={s.x} cy={s.y} r={22} fill="none" stroke="#fff" strokeOpacity=".08" strokeWidth=".6" />
                <Glints x={s.x} y={s.y} len={64} w={1.1} />
                <Glints x={s.x} y={s.y} len={18} w={0.6} rot={45} o={0.45} />
                <circle cx={s.x} cy={s.y} r={2.4} fill="#fff" />
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
