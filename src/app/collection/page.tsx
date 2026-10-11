import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import CollectionWallet from '@/components/skychaser/CollectionWallet'
import CollectionHead from '@/components/skychaser/CollectionHead'
import HolderCollection from '@/components/skychaser/HolderCollection'
import SkychaserShell from '@/components/skychaser/SkychaserShell'
import SkychaserView from '@/components/skychaser/SkychaserView'
import DataRow from '@/components/skychaser/ui/DataRow'
import { getDb } from '@/lib/db'
import { holderView, type HolderEdition } from '@/lib/skychaser/repo'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Collection',
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
  let summary: ReactNode = null
  let held = 0

  if (!wallet) {
    body = (
      <div className="sd-gate">
        <CollectionWallet />
      </div>
    )
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
    if (editions) {
      held = editions.length
      const photographed = editions.filter((e) => e.latest).length
      summary = (
        <DataRow
          className="sd-strip"
          items={[
            { label: 'Cards', value: editions.length },
            { label: 'Photographed', value: `${photographed} / ${editions.length}` },
          ]}
        />
      )
      body = <HolderCollection editions={editions} />
    } else {
      body = <p className="sd-note">The Collection cannot be read at the moment.</p>
    }
  }

  return (
    <SkychaserShell title="Collection">
      <SkychaserView step="collection" />
      <section className="sd-container sd-top">
        {wallet && <CollectionHead wallet={wallet} cards={held} />}
        {summary}
        <div className={summary ? 'sd-chapter-block' : undefined} style={summary ? { marginTop: 32 } : undefined}>
          {body}
        </div>
      </section>
    </SkychaserShell>
  )
}
