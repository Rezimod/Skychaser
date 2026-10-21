'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import CardThumb from './CardThumb'
import { usePrivySafe } from './usePrivySafe'
import { useSkychaserHolder } from './useSkychaserHolder'
import { warmPrivy } from './SkychaserAuth'

const FAN = ['EARTH', 'SATURN', 'M42']

/**
 * The Collection is read by wallet. A signed-in holder never has to type
 * theirs — the page sends itself to their address as soon as Privy answers —
 * and anyone can read a Collection by naming its holder, so the page is never
 * a dead end while the session is still being read.
 */
export default function CollectionWallet() {
  const router = useRouter()
  const { ready, authenticated, address } = useSkychaserHolder()
  const { login } = usePrivySafe()
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (ready && authenticated && address) router.replace(`/collection?wallet=${address}`)
  }, [ready, authenticated, address, router])

  const opening = ready && authenticated && address

  return (
    <div className="sd-coll__gate">
      <div className="sd-coll__gate-copy">
        <p className="sd-coll__kicker">Collection</p>
        <h1 className="sd-coll__title">Your collection</h1>
        <p className="sd-coll__lede">Every edition you hold, its number, and every photograph the Live Telescope will take of it. Collections are public, like the log.</p>
        {opening ? (
          <p className="sd-note">Opening your Collection.</p>
        ) : (
          <>
            <button type="button" className="sd-btn sd-btn--primary sd-coll__login" onPointerEnter={warmPrivy} onTouchStart={warmPrivy} onFocus={warmPrivy} onClick={() => login()} disabled={!ready}>
              {ready ? 'Log in' : 'Reading the account'}
            </button>
            <form
              className="sd-coll__lookup"
              onSubmit={(e) => {
                e.preventDefault()
                const wallet = typed.trim()
                if (wallet) router.push(`/collection?wallet=${encodeURIComponent(wallet)}`)
              }}
            >
              <label className="sd-coll__lookup-k" htmlFor="sd-holder">
                Or read any holder
              </label>
              <div className="sd-coll__lookup-row">
                <input
                  id="sd-holder"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="Holder address"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button type="submit" disabled={!typed.trim()} aria-label="Read the collection">
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </div>
            </form>
          </>
        )}
      </div>
      <div className="sd-coll__fan" aria-hidden="true">
        {FAN.map((d, i) => (
          <span key={d} className="sd-coll__fancard" data-i={i}>
            <CardThumb designation={d} eager />
          </span>
        ))}
      </div>
    </div>
  )
}
