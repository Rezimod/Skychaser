import type { Metadata } from 'next';
import CardFront from '@/components/skychaser/card/CardFront';
import CardHalo from '@/components/skychaser/card/CardHalo';
import SkychaserCard from '@/components/skychaser/card/SkychaserCard';
import SkychaserShell from '@/components/skychaser/SkychaserShell';
import { plateFor } from '@/lib/skychaser/plate';
import '@/components/skychaser/card/skychaser-card.css';
import './preview.css';

/**
 * A proposal, for the owner to approve: every card drawn the way the Roadster
 * is on its own page. Not linked from anywhere and kept out of search; it goes
 * once the style is rolled out to every card.
 */
export const metadata: Metadata = {
  title: 'Card style — proposal',
  robots: { index: false, follow: false },
};

/** One of each rarity, the Roadster first: it is the card the style is taken from. */
const HELD = ['ROADSTER', 'CANYON-DIABLO', 'M42', 'SUN'];
/** A shelf across the set, at the size the Genesis grid draws its tiles. */
const SHELF = ['SATURN', 'BETELGEUSE', 'IMILAC', 'EUROPA', 'JUPITER', 'MOON', 'GIBEON', 'ISS'];
/** Cards some pages still show as a pre-drawn picture, beside the live face. */
const BAKED = ['M42', 'CANYON-DIABLO'];

function plate(designation: string) {
  const p = plateFor(designation);
  if (!p) throw new Error(`Preview: ${designation} has no card face`);
  return p;
}

export default function CardsPreview() {
  return (
    <SkychaserShell>
      <div className="cpv">
        <header className="cpv-head">
          <p className="cpv-ey">Card style · for approval</p>
          <h1>
            Every card,
            <br />
            <em>like the Roadster.</em>
          </h1>
          <p className="cpv-sub">
            The face is the one the card page holds up: the metal frame in the rarity&rsquo;s colour, the glossy badge, the number in the card&rsquo;s own colour,
            the name and price in Anton. What is new is the light: a glow in the art&rsquo;s colour at the frame, and a wider one in the rarity&rsquo;s behind it,
            scaled to the card, so a small tile on the shelf is lit like the card on its own page.
          </p>
        </header>

        <section className="cpv-sec" aria-labelledby="cpv-held">
          <div className="cpv-label">
            <h2 id="cpv-held">Held up</h2>
            <span>One of each rarity · move across a card</span>
          </div>
          <div className="cpv-held">
            {HELD.map((d) => {
              const p = plate(d);
              return (
                <figure key={d}>
                  <CardHalo designation={d} rarity={p.rarity}>
                    <SkychaserCard designation={d} priority />
                  </CardHalo>
                  <figcaption>
                    {p.rname} · No. {p.num}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </section>

        <section className="cpv-sec" aria-labelledby="cpv-shelf">
          <div className="cpv-label">
            <h2 id="cpv-shelf">On the shelf</h2>
            <span>The size of a Genesis tile</span>
          </div>
          <div className="cpv-shelf">
            {SHELF.map((d) => {
              const p = plate(d);
              return (
                <CardHalo key={d} designation={d} rarity={p.rarity}>
                  <CardFront plate={p} small u="" />
                </CardHalo>
              );
            })}
          </div>
        </section>

        <section className="cpv-sec" aria-labelledby="cpv-now">
          <div className="cpv-label">
            <h2 id="cpv-now">Today, and proposed</h2>
            <span>The collection and share images still use a pre-drawn picture</span>
          </div>
          <div className="cpv-pairs">
            {BAKED.map((d) => {
              const p = plate(d);
              return (
                <div key={d} className="cpv-pair">
                  <figure>
                    <img src={`${p.art}/card.webp?v=specimen9`} alt={`${p.name}, the pre-drawn picture`} width={520} height={726} />
                    <figcaption>Today</figcaption>
                  </figure>
                  <figure>
                    <CardHalo designation={d} rarity={p.rarity}>
                      <CardFront plate={p} u="" />
                    </CardHalo>
                    <figcaption>Proposed</figcaption>
                  </figure>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </SkychaserShell>
  );
}
