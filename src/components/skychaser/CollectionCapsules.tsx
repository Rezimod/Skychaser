'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { usePrivySafe } from './usePrivySafe'
import { useSkychaserHolder } from './useSkychaserHolder'
import type { HeldCapsule } from '@/lib/skychaser/capsule'
import { tierByKey } from '@/lib/skychaser/tiers'

const pad = (n: number) => String(n).padStart(3, '0')

/**
 * The holder's capsules bought and not yet opened, on their own Collection
 * only: a capsule paid for and left sealed — a tab closed before the reveal —
 * waits here with the way to open it, rather than only behind its link.
 * Nothing shows until there is one.
 */
export default function CollectionCapsules({ wallet }: { wallet: string }) {
  const { authenticated, address } = useSkychaserHolder()
  const { getAccessToken } = usePrivySafe()
  // Read once per sign-in: the token getter is not guaranteed to keep its identity across renders.
  const accessToken = useRef(getAccessToken)
  accessToken.current = getAccessToken
  const [capsules, setCapsules] = useState<HeldCapsule[]>([])
  const mine = authenticated && address === wallet

  useEffect(() => {
    if (!mine) return
    let live = true
    ;(async () => {
      const token = await accessToken.current()
      if (!token) return
      const res = await fetch('/api/skychaser/capsules/mine', { headers: { Authorization: `Bearer ${token}` } })
      const data = (await res.json().catch(() => ({}))) as { capsules?: HeldCapsule[] }
      if (live && res.ok && Array.isArray(data.capsules)) setCapsules(data.capsules)
    })().catch(() => {})
    return () => {
      live = false
    }
  }, [mine])

  if (!mine || capsules.length === 0) return null

  return (
    <section className="sd-coll__sealed" aria-labelledby="coll-sealed">
      <div className="sd-coll__bar">
        <h2 className="sd-coll__h" id="coll-sealed">
          Sealed <span>{capsules.length}</span>
        </h2>
      </div>
      <p className="sd-coll__sealed-note">Bought and not yet opened. Each capsule keeps its cards until you open it.</p>
      <ul className="sd-coll__sealed-list">
        {capsules.map((c) => {
          const tier = tierByKey(c.tier)?.name
          return (
            <li key={c.capsuleId}>
              <img src="/cards/capsule.webp?v=1" alt="" width={695} height={720} />
              <div className="sd-coll__sealed-what">
                <strong>Capsule {pad(c.sequence)}</strong>
                <span className="sd-data">
                  {[tier, `Bought ${c.purchasedAt.slice(0, 10)}`].filter(Boolean).join(' · ')}
                </span>
              </div>
              <span className="sd-coll__sealed-state" data-paid={c.payment === 'paid' ? '' : undefined}>
                {c.payment === 'paid' ? 'Paid' : 'Awaiting payment'}
              </span>
              <Link href={`/capsule/${c.capsuleId}`} className="sd-btn sd-btn--primary" aria-label={`Open capsule ${pad(c.sequence)}`}>
                Open
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
