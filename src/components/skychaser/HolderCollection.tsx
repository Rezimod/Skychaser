import CardPlate from './CardPlate'
import Caption from './ui/Caption'
import type { Rarity } from '@/lib/rarity'
import { rarityInfo } from '@/lib/rarity'
import type { CaptureSummary, HolderEdition } from '@/lib/skychaser/repo'

function captureParts(capture: CaptureSummary): string[] {
  return [
    `Node ${capture.nodeId}`,
    new Date(capture.capturedAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
    capture.provenance === 'instrument' ? 'Instrument' : 'Simulated',
  ]
}

/**
 * A holder's editions as plates, scarcest first. Each one carries its own
 * number and, where Live Telescope V1 has photographed the object, the capture data
 * beneath it — the photograph is the card's, shared by every edition of it.
 */
export default function HolderCollection({ editions }: { editions: HolderEdition[] }) {
  if (editions.length === 0) {
    return <p className="sd-note">No cards yet. Genesis is where they come from.</p>
  }

  const ordered = [...editions].sort((a, b) => {
    const rank = rarityInfo(b.rarity as Rarity).rank - rarityInfo(a.rarity as Rarity).rank
    return rank !== 0 ? rank : a.designation.localeCompare(b.designation)
  })

  return (
    <>
      <h2 className="sd-section__title sd-section">Editions held</h2>
      <ul className="sd-grid">
        {ordered.map((e) => (
          <li key={e.editionId}>
            <CardPlate designation={e.designation} edition={e.editionNumber} href={`/card/${e.designation}`} />
            <div className="sd-coll__meta" data-rarity={e.rarity}>
              <span className="sd-rtag">{rarityInfo(e.rarity as Rarity).label}</span>
              <span className="sd-tile__num">
                No. {String(e.editionNumber).padStart(3, '0')} of {e.editionSize}
              </span>
            </div>
            {e.latest ? (
              <Caption as="p" parts={captureParts(e.latest)} />
            ) : (
              <Caption as="p">Photograph after first light</Caption>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
