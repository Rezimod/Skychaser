'use client'

import { useState, type CSSProperties } from 'react'
import { Check, Copy } from 'lucide-react'
import { useSkychaserHolder } from './useSkychaserHolder'
import ShareCard from './ShareCard'
import { RARITIES, isRarity, rarityInfo, type Rarity } from '@/lib/rarity'
import { SHELF_CARDS } from '@/lib/sets/shelf'
import type { HolderEdition } from '@/lib/skychaser/repo'

const SET = new Set(SHELF_CARDS.map((c) => c.seed.designation))

/**
 * The Collection's head: whose it is (yours when the address is the signed-in
 * holder's), the address to copy, the share, and the collection in figures —
 * cards held, how much of the set, the rarest, what the telescope has taken —
 * with the rarities as one bar.
 */
export default function CollectionHead({ wallet, editions }: { wallet: string; editions: HolderEdition[] }) {
  const { address } = useSkychaserHolder()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(wallet)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const mine = address === wallet
  const cards = editions.length
  const designations = new Set(editions.map((e) => e.designation))
  const inSet = [...designations].filter((d) => SET.has(d)).length
  const photographed = new Set(editions.filter((e) => e.latest).map((e) => e.designation)).size
  const counts = new Map<Rarity, number>()
  for (const e of editions) if (isRarity(e.rarity)) counts.set(e.rarity, (counts.get(e.rarity) ?? 0) + 1)
  const spread = [...RARITIES].reverse().filter((r) => counts.get(r))
  const rarest = spread[0]

  return (
    <header className="sd-coll__hero">
      <div className="sd-coll__who">
        <p className="sd-coll__kicker">Collection</p>
        <h1 className="sd-coll__title">{mine ? 'Your collection' : 'A collection'}</h1>
        <button type="button" className="sd-coll__addr" onClick={copy} aria-label={copied ? 'Address copied' : 'Copy holder address'} title={wallet}>
          <span className="sd-coll__addr-k">Holder</span>
          <span className="sd-coll__addr-v">{`${wallet.slice(0, 4)}…${wallet.slice(-4)}`}</span>
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        </button>
        {cards > 0 && (
          <div className="sd-coll__share">
            <ShareCard
              title="My Skychaser collection"
              text={mine ? `My Skychaser collection: ${cards} ${cards === 1 ? 'card' : 'cards'} of the cosmos, each a numbered edition.` : `A Skychaser collection: ${cards} ${cards === 1 ? 'card' : 'cards'} of the cosmos.`}
              url={`https://skychaser.io/collection?wallet=${wallet}`}
            />
          </div>
        )}
      </div>

      {cards > 0 && (
        <div className="sd-coll__figures">
          <dl className="sd-coll__stats">
            <div>
              <dt>Cards</dt>
              <dd>{cards}</dd>
            </div>
            <div>
              <dt>Of the set</dt>
              <dd>
                {inSet}
                <small> / {SET.size}</small>
              </dd>
              <span className="sd-coll__meter" aria-hidden="true">
                <i style={{ width: `${Math.max(2, (inSet / SET.size) * 100)}%` }} />
              </span>
            </div>
            <div>
              <dt>Rarest</dt>
              <dd className="sd-coll__rarest" style={rarest ? ({ '--rarity': rarityInfo(rarest).color } as CSSProperties) : undefined}>
                {rarest ? rarityInfo(rarest).label : '—'}
              </dd>
            </div>
            <div>
              <dt>Photographed</dt>
              <dd>
                {photographed}
                <small> / {designations.size}</small>
              </dd>
            </div>
          </dl>
          <div className="sd-coll__spread">
            <div className="sd-coll__spreadbar" role="img" aria-label={spread.map((r) => `${rarityInfo(r).label} ${counts.get(r)}`).join(', ')}>
              {spread.map((r) => (
                <i key={r} style={{ flexGrow: counts.get(r), '--r': rarityInfo(r).color } as CSSProperties} />
              ))}
            </div>
            <ul className="sd-coll__legend">
              {spread.map((r) => (
                <li key={r} style={{ '--r': rarityInfo(r).color } as CSSProperties}>
                  <i aria-hidden="true" />
                  {rarityInfo(r).label}
                  <b>{counts.get(r)}</b>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </header>
  )
}
