'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePrivySafe } from './usePrivySafe'
import { useSkychaserHolder } from './useSkychaserHolder'

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

  if (ready && authenticated && address) return <p className="sd-note">Opening your Collection.</p>

  return (
    <>
      <p className="sd-lede">Your editions and every photograph the Live Telescope will take of them. Collections are public, like the log.</p>
      <div className="sd-pay__actions sd-section">
        <button type="button" className="sd-btn sd-btn--primary" onClick={() => login()} disabled={!ready}>
          {ready ? 'Log in' : 'Reading the account'}
        </button>
      </div>
      <p className="sd-gate__or">or read any holder</p>
      <form
        className="sd-pay__actions"
        onSubmit={(e) => {
          e.preventDefault()
          const wallet = typed.trim()
          if (wallet) router.push(`/collection?wallet=${encodeURIComponent(wallet)}`)
        }}
      >
        <label className="sr-only" htmlFor="sd-holder">
          Holder address
        </label>
        <input
          id="sd-holder"
          className="sd-input"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Holder address"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className="sd-btn" disabled={!typed.trim()}>
          Read it
        </button>
      </form>
    </>
  )
}
