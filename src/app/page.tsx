import { APP_URL } from '@/lib/skychaser/app-origin';
import type { Metadata } from 'next';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import CardThumb from '@/components/skychaser/CardThumb';
import OddsBoard from '@/components/skychaser/OddsBoard';
import PlanetsTonight from '@/components/skychaser/PlanetsTonight';
import OrbitRing from '@/components/skychaser/OrbitRing';
import SkyReveal from '@/components/skychaser/SkyReveal';
import Sunburst from '@/components/skychaser/Sunburst';
import SkychaserShell from '@/components/skychaser/SkychaserShell';
import SkychaserView from '@/components/skychaser/SkychaserView';
import { getDb } from '@/lib/db';
import { getNode } from '@/lib/observatory/nodes';
import { card } from '@/lib/schema';
import { SET_GROUPS } from '@/lib/sets/groups';
import { SET_001_CARD_BY_DESIGNATION } from '@/lib/sets/set-001';
import { TIERS } from '@/lib/skychaser/tiers';
import { nightRow } from '@/lib/skychaser/night';
import { siteNightDate } from '@/lib/skychaser/target';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Skychaser — the cosmos, issued in editions',
  description:
    'Genesis: real objects of the cosmos, each held as a numbered edition. Opened from sealed capsules, from $5.',
};

/** Six cards from across the set, one shelf of it. */
const SHOWCASE = ['BETELGEUSE', 'M51', 'ROADSTER', 'CARINA', 'TYCHO', 'CANYON-DIABLO'];

/** The cards turning round the sun in the orbit section. */
const ORBIT = ['FIRST-LIGHT', 'EARTHRISE', 'M1', 'TON-618', 'HALLEY', 'EUROPA', 'APOLLO-11', 'GREAT-ECLIPSE', 'M104', 'PLUTO', 'TARANTULA', 'IMILAC'];

const FROM_USD = Math.min(...TIERS.map((t) => t.priceUsd));

export default async function HomePage() {
  const node = getNode('tbilisi-01')!;
  const db = getDb();

  let tonight: string | null = null;
  if (db) {
    try {
      const night = await nightRow(db, siteNightDate(node.timezone, new Date()));
      if (night) {
        const [row] = await db.select({ designation: card.designation }).from(card).where(eq(card.id, night.cardId));
        tonight = row?.designation ?? null;
      }
    } catch (err) {
      console.error('[skychaser] cannot read tonight', err);
    }
  }
  const tonightCard = tonight ? SET_001_CARD_BY_DESIGNATION.get(tonight) : undefined;

  return (
    <SkychaserShell>
      <SkychaserView step="landing" />

      <section className="sd-hero3">
        <SkyReveal />
        <div className="sd-container sd-hero3__copy">
          <h1 className="sd-hero3__title">
            Hold a piece of <em>the cosmos</em>
          </h1>
          <p className="sd-hero3__sub">
            Real objects, numbered editions. A card is a seat at the telescope — and, for some, an object you can hold.
          </p>
          <div className="sd-hero3__cta">
            <Link href="/capsules" className="sd-btn sd-btn--light">
              Open a capsule · ${TIERS[0].priceUsd}
            </Link>
            <Link href={APP_URL} className="sd-btn">
              Browse the cards
            </Link>
          </div>
        </div>
      </section>

      <PlanetsTonight />

      <section className="sd-container sd-home-sec sd-bento" id="how" aria-label="Skychaser tonight">
        <Link href={`/card/${tonightCard?.seed.designation ?? 'HUNTERS-MOON'}`} className="sd-bento__tile sd-bento__tonight">
          <img src={`/cards/art/sm/${tonightCard?.seed.designation ?? 'HUNTERS-MOON'}.webp`} alt="" width={440} height={584} loading="lazy" />
          <span className="sd-bento__text">
            <span className="sd-bento__kicker">{tonightCard ? 'Tonight over Tbilisi' : 'In the set'}</span>
            <strong>{tonightCard?.seed.name ?? "The Hunter's Moon"}</strong>
            <span>Where the telescope points tonight.</span>
          </span>
        </Link>
        <Link href="/capsules" className="sd-bento__tile sd-bento__open">
          <img src="/cards/capsule.webp" alt="" width={695} height={720} loading="lazy" />
          <span className="sd-bento__text">
            <span className="sd-bento__kicker">Capsules</span>
            <strong>One sealed card, from ${FROM_USD}</strong>
            <span>Every draw is fixed before sale and opened in public.</span>
            <span className="sd-btn sd-btn--light sd-bento__btn">Open a capsule</span>
          </span>
        </Link>
        <Link href="/voyage" className="sd-bento__tile sd-bento__voyage">
          <img src="/cards/art/sm/TITAN.webp" alt="" width={440} height={584} loading="lazy" />
          <span className="sd-bento__text">
            <span className="sd-bento__kicker">Voyage</span>
            <strong>Fly the Kestrel</strong>
            <span>A game across the solar system.</span>
          </span>
        </Link>
        <Link href="/vote" className="sd-bento__tile sd-bento__vote">
          <img src="/cards/art/sm/HORSEHEAD.webp" alt="" width={440} height={584} loading="lazy" />
          <span className="sd-bento__text">
            <span className="sd-bento__kicker">Weekly vote</span>
            <strong>Choose what we observe</strong>
            <span>Holders pick the telescope&apos;s target.</span>
          </span>
        </Link>
        <div className="sd-bento__tile sd-bento__seeker">
          <span className="sd-bento__kicker">Solana Seeker</span>
          <strong>Skychaser is coming to the Seeker dApp Store.</strong>
          <span>Seeker owners get a badge on their account.</span>
        </div>
      </section>

      <section className="sd-container sd-home-sec sd-oddsec" aria-labelledby="odds-title">
        <h2 className="sd-home-sec__title" id="odds-title">
          The odds are published
        </h2>
        <OddsBoard />
      </section>

      <section className="sd-container sd-home-sec sd-showcase2" aria-labelledby="set-title">
        <div className="sd-showcase2__copy">
          <h2 className="sd-home-sec__title" id="set-title">
            Genesis
          </h2>
          <p className="sd-home-sec__lede">Real objects, numbered outward from Earth.</p>
          <ul className="sd-families">
            {SET_GROUPS.map((g) => (
              <li key={g.key}>
                <span>{g.title}</span>
              </li>
            ))}
          </ul>
          <Link href="/genesis" className="sd-btn">
            See the set
          </Link>
        </div>
        <ul className="sd-showcase2__cards">
          {SHOWCASE.map((d) => (
            <li key={d}>
              <Link href={`/card/${d}`} aria-label={SET_001_CARD_BY_DESIGNATION.get(d)?.seed.name ?? d} data-zoom={d}>
                <CardThumb designation={d} eager small />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="sd-home-sec sd-orbit" aria-labelledby="orbit-title">
        <div className="sd-container sd-orbit__copy">
          <h2 className="sd-home-sec__title" id="orbit-title">
            Every card turns with the sky
          </h2>
          <p className="sd-home-sec__lede">
            From the craters of the Moon to the black hole at the centre of the galaxy — each one real, issued once and numbered.
          </p>
        </div>
        <OrbitRing designations={ORBIT} />
      </section>

      <section className="sd-container sd-home-sec sd-closer2" aria-labelledby="close-title">
        <Sunburst className="sd-closer2__burst" />
        <h2 className="sd-closer2__title" id="close-title">
          The cosmos, <em>issued in editions</em>.
        </h2>
        <p className="sd-home-sec__lede">Sealed before sale. Published after opening.</p>
        <div className="sd-hero2__cta">
          <Link href="/capsules" className="sd-btn sd-btn--light">
            Open a capsule · ${TIERS[0].priceUsd}
          </Link>
          <Link href="/capsules/log" className="sd-btn">
            Public log
          </Link>
        </div>
      </section>
    </SkychaserShell>
  );
}
