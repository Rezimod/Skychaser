import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import CollectionCapsules from '@/components/skychaser/CollectionCapsules'
import CollectionWallet from '@/components/skychaser/CollectionWallet'
import CollectionHead from '@/components/skychaser/CollectionHead'
import HolderCollection from '@/components/skychaser/HolderCollection'
import SkychaserShell from '@/components/skychaser/SkychaserShell'
import SkychaserView from '@/components/skychaser/SkychaserView'
import { getDb } from '@/lib/db'
import { holderView, type HolderEdition } from '@/lib/skychaser/repo'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Collection — Skychaser',
  robots: { index: false },
}

export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ wallet?: string | string[] }>
}) {
  const { wallet: raw } = await searchParams
  const wallet = typeof raw === 'string' ? raw.trim() : ''

  let body: ReactNode

  if (!wallet) {
    body = <CollectionWallet />
  } else {
    const db = getDb()
    let editions: HolderEdition[] | null = null
    if (db) {
      try {
        editions = await holderView(db, wallet)
      } catch (err) {
        console.error('[skychaser] cannot read collection', err)
      }
    }
    body = editions ? (
      <>
        <CollectionHead wallet={wallet} editions={editions} />
        <CollectionCapsules wallet={wallet} />
        <HolderCollection editions={editions} />
      </>
    ) : (
      <p className="sd-note">The Collection cannot be read at the moment.</p>
    )
  }

  return (
    <SkychaserShell>
      <SkychaserView step="collection" />
      <section className="sd-container sd-top sd-coll">{body}</section>
    </SkychaserShell>
  )
}
