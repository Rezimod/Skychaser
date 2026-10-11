'use client'

import { useState } from 'react'
import { useSkychaserHolder } from './useSkychaserHolder'
import ShareCard from './ShareCard'

/** The collection's heading: yours when the address is the signed-in holder's, and the holder's address, copyable. */
export default function CollectionHead({ wallet, cards }: { wallet: string; cards: number }) {
  const { address } = useSkychaserHolder()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(wallet)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <header className="sd-coll__head">
      <h1 className="sd-fl__title">{address === wallet ? 'Your collection' : 'Collection'}</h1>
      <p className="sd-fl__meta sd-coll__holder">
        Holder <span title={wallet}>{`${wallet.slice(0, 4)}…${wallet.slice(-4)}`}</span>
        <button type="button" className="sd-menu__copy" onClick={copy} aria-label="Copy holder address">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </p>
      {cards > 0 && (
        <div className="sd-coll__share">
          <ShareCard
            title="My Skychaser collection"
            text={address === wallet ? `My Skychaser collection: ${cards} ${cards === 1 ? 'card' : 'cards'} of the cosmos, each a numbered edition.` : `A Skychaser collection: ${cards} ${cards === 1 ? 'card' : 'cards'} of the cosmos.`}
            url={`https://stellarr.club/collection?wallet=${wallet}`}
          />
        </div>
      )}
    </header>
  )
}
