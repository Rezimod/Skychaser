import type { Metadata } from 'next';
import Link from 'next/link';
import SkychaserShell from '@/components/skychaser/SkychaserShell';
import Chapter from '@/components/skychaser/ui/Chapter';
import { FIRST_LIGHT_WHEN } from '@/lib/skychaser/first-light';

export const metadata: Metadata = {
  title: 'Terms — Skychaser',
  description: 'The terms for holding Skychaser cards and opening capsules.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <SkychaserShell title="Terms">
      <article className="sd-container sd-top sd-legal">
        <p className="sd-label">Last updated 17 November 2026</p>

        <section className="sd-chapter-block">
          <Chapter title="What Skychaser is" />
          <p>
            Skychaser is a set of collectible cards, each a numbered edition of a real object or a dated event in the sky. It is run
            by Astroman (astroman.ge). The Live Telescope, the telescope that will photograph the night&rsquo;s card, is being commissioned for first light
            in {FIRST_LIGHT_WHEN}: until it is operational, no photograph is promised.
          </p>
        </section>

        <section className="sd-chapter-block">
          <Chapter title="Who can buy" />
          <p>
            Capsules and cards are sold to adults, 18 or older. A parent or guardian may buy for a child, and holds the account
            the cards sit on.
          </p>
        </section>

        <section className="sd-chapter-block">
          <Chapter title="Your account" />
          <p>
            You log in through Privy with email or a wallet. Your cards are held against the Solana wallet on that account.
            Keep the account to yourself; whoever controls it controls the cards.
          </p>
        </section>

        <section className="sd-chapter-block">
          <Chapter title="Capsules and cards" />
          <p>
            A capsule holds one card, drawn under the published odds and committed by hash before it goes on sale. The public{' '}
            <Link href="/capsules/log">log</Link> records every listing, sale and opening, and anyone can recompute a draw after
            it is opened. A card bought directly is the next free edition of that card. Prices are shown in US dollars and
            charged in SOL at the rate quoted at checkout; a quote holds for fifteen minutes.
          </p>
        </section>

        <section className="sd-chapter-block">
          <Chapter title="What a card is not" />
          <p>
            A card is a record of an edition in this collection. It carries no promise of financial value, resale or return.
            Buy a capsule for the cards and the photographs to come, not as an investment.
          </p>
        </section>

        <section className="sd-chapter-block">
          <Chapter title="What each rarity gives" />
          <p>
            Legendary cards carry a physical item: a piece of the meteorite, or of the Moon, that the card shows. These items are
            planned, not yet shipping. How to redeem one, and where it can be sent, will be published here before any item ships.
          </p>
          <p>
            Each edition of an Epic card is one 30-minute session on the Live Telescope, and each edition of a Rare card is one entry
            in the draw for a visitor&rsquo;s seat at a live session. The Live Telescope is being commissioned for first light in {FIRST_LIGHT_WHEN};
            sessions and visitor seats open with it, and how they are booked and drawn will be published here first. If first light
            comes later than planned, these perks do not lapse: each is honoured once the telescope opens. Every card votes on the night&rsquo;s
            target, with the weight shown on the card.
          </p>
        </section>

        <section className="sd-chapter-block">
          <Chapter title="Paying in SOL" />
          <p>
            The price of SOL moves. The dollar price is fixed for the fifteen minutes of a quote; after that a new quote may
            ask for more or less SOL. A payment on Solana cannot be reversed by us or by anyone else once it is confirmed, so
            check the amount before you send it. We cannot recover cards from an account you lose access to.
          </p>
        </section>

        <section className="sd-chapter-block">
          <Chapter title="When something goes wrong" />
          <p>
            If a payment lands and nothing is delivered, because a card sold out between order and payment or a capsule was
            withdrawn, write to us with the transaction and we will refund it by hand. Opened capsules are final.
          </p>
        </section>

        <section className="sd-chapter-block">
          <Chapter title="Changes" />
          <p>
            These terms change as Skychaser does. The date above moves when they do, and continuing to use Skychaser after a change
            means accepting it. Questions go to <Link href="/contact">Contact</Link>.
          </p>
        </section>
      </article>
    </SkychaserShell>
  );
}
