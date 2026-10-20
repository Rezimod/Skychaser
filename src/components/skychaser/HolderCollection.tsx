'use client'

import Link from 'next/link'
import { useMemo, useState, type CSSProperties } from 'react'
import CardThumb from './CardThumb'
import { accentFor } from './card/CardFront'
import { RARITIES, isRarity, rarityInfo, type Rarity } from '@/lib/rarity'
import { plateFor } from '@/lib/skychaser/plate'
import type { CaptureSummary, HolderEdition } from '@/lib/skychaser/repo'

const pad = (n: number) => String(n).padStart(3, '0')

function captureParts(capture: CaptureSummary): string {
  return [
    `Node ${capture.nodeId}`,
    new Date(capture.capturedAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
    capture.provenance === 'instrument' ? 'Instrument' : 'Simulated',
  ].join(' · ')
}

type Group = { designation: string; name: string; rarity: Rarity; size: number; numbers: number[]; latest: CaptureSummary | null }

/**
 * A holder's editions, scarcest first. Two editions of one card share a tile
 * that carries both numbers. The rarities above the grid filter it in place;
 * nothing moves but what is shown.
 */
export default function HolderCollection({ editions }: { editions: HolderEdition[] }) {
  const [family, setFamily] = useState<'all' | Rarity>('all')

  const groups = useMemo(() => {
    const by = new Map<string, Group>()
    for (const e of editions) {
      const rarity = isRarity(e.rarity) ? e.rarity : 'common'
      const g = by.get(e.designation) ?? { designation: e.designation, name: e.name, rarity, size: e.editionSize, numbers: [], latest: e.latest }
      g.numbers.push(e.editionNumber)
      by.set(e.designation, g)
    }
    for (const g of by.values()) g.numbers.sort((a, b) => a - b)
    return [...by.values()].sort((a, b) => rarityInfo(b.rarity).rank - rarityInfo(a.rarity).rank || a.designation.localeCompare(b.designation))
  }, [editions])

  const counts = useMemo(() => {
    const c = new Map<Rarity, number>()
    for (const e of editions) if (isRarity(e.rarity)) c.set(e.rarity, (c.get(e.rarity) ?? 0) + 1)
    return c
  }, [editions])

  if (editions.length === 0)
    return (
      <div className="sd-coll__empty">
        <img src="/cards/capsule.webp?v=1" alt="" width={695} height={720} />
        <div>
          <h2 className="sd-coll__h">No cards yet</h2>
          <p>Every card arrives sealed in a capsule. Open one at Genesis and it lands here, with its edition number.</p>
          <Link href="/genesis" className="sd-btn sd-btn--primary">
            Open a capsule
          </Link>
        </div>
      </div>
    )

  const held = [...RARITIES].reverse().filter((r) => counts.get(r))
  const shown = family === 'all' ? groups : groups.filter((g) => g.rarity === family)

  return (
    <section className="sd-coll__shelf" aria-labelledby="coll-editions">
      <div className="sd-coll__bar">
        <h2 className="sd-coll__h" id="coll-editions">
          Editions <span>{family === 'all' ? editions.length : counts.get(family)}</span>
        </h2>
        {held.length > 1 && (
          <div className="sd-filter__chips" role="group" aria-label="Rarity">
            <button type="button" className="sd-filter__chip" data-rarity="all" aria-pressed={family === 'all'} onClick={() => setFamily('all')}>
              All
            </button>
            {held.map((r) => (
              <button key={r} type="button" className="sd-filter__chip" data-rarity={r} aria-pressed={family === r} onClick={() => setFamily(r)}>
                <i aria-hidden="true" />
                {rarityInfo(r).label}
                <b>{counts.get(r)}</b>
              </button>
            ))}
          </div>
        )}
      </div>

      <ul className="sd-fl__grid sd-coll__grid">
        {shown.map((g) => {
          const many = g.numbers.length > 1
          const label = many ? `No. ${g.numbers.map(pad).join(', ')}` : `No. ${pad(g.numbers[0])}`
          return (
            <li key={g.designation} data-rarity={g.rarity}>
              {plateFor(g.designation) ? (
                <Link
                  href={`/card/${g.designation}`}
                  className="sd-tile"
                  data-rarity={g.rarity}
                  aria-label={`${g.name}, ${label} of ${g.size}`}
                  style={{ '--tile-glow': accentFor(g.designation) } as CSSProperties}
                >
                  <span className="sd-tile__stage">
                    <CardThumb designation={g.designation} price={many ? `×${g.numbers.length}` : `#${pad(g.numbers[0])}`} sub={`${label} of ${g.size}`} />
                  </span>
                </Link>
              ) : (
                <div className="sdc-card sdc-card--blank sd-coll__blank">
                  <strong>{g.name}</strong>
                  <span>{label}</span>
                </div>
              )}
              <p className="sd-coll__cap" data-seen={g.latest ? '' : undefined}>
                <i aria-hidden="true" />
                {g.latest ? captureParts(g.latest) : 'Photograph after first light'}
              </p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
