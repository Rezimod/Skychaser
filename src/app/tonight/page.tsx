import type { Metadata } from 'next';
import Link from 'next/link';
import ObjectPhoto from '@/components/skychaser/ObjectPhoto';
import SkychaserBallot from '@/components/skychaser/SkychaserBallot';
import SkychaserShell from '@/components/skychaser/SkychaserShell';
import SkychaserView from '@/components/skychaser/SkychaserView';
import TonightSkyChart from '@/components/skychaser/TonightSkyChart';
import Chapter from '@/components/skychaser/ui/Chapter';
import DataRow, { type Datum } from '@/components/skychaser/ui/DataRow';
import { getDb } from '@/lib/db';
import { CLOUD_LIMIT } from '@/lib/observatory/adapter';
import { getNode } from '@/lib/observatory/nodes';
import { isRarity, type Rarity } from '@/lib/rarity';
import { addDays, tonightView, type TonightView } from '@/lib/skychaser/night';
import { SET_001_CARD_BY_DESIGNATION } from '@/lib/sets/set-001';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tonight — the card the Live Telescope will photograph',
  description: 'One object a night, chosen by the holders among what the Live Telescope can photograph. First light in November.',
};

const RESULT: Record<TonightView['recent'][number]['result'], string> = {
  photographed: 'Photographed',
  lost: 'Lost to cloud',
  none: 'No photograph',
};

const rarityOf = (r: string): Rarity => (isRarity(r) ? r : 'common');

export default async function TonightPage() {
  const node = getNode('tbilisi-01')!;
  const now = new Date();
  const db = getDb();
  let view: TonightView | null = null;
  if (db) {
    try {
      view = await tonightView(db, node, now);
    } catch (err) {
      console.error('[skychaser] cannot read tonight', err);
    }
  }

  const localTime = (iso: string) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: node.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
      new Date(iso),
    );
  const dateOf = (night: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(new Date(`${night}T00:00:00Z`));
  const nightLabel = (night: string) => dateOf(night, { day: 'numeric', month: 'long' });

  const d = view?.decided ?? null;
  const lastLost = view?.recent.find((r) => r.night === addDays(view.night, -1) && r.result === 'lost') ?? null;
  const candidates = view?.voting.candidates ?? [];
  const cast = candidates.reduce((sum, c) => sum + c.votes, 0);
  // Before the decision the page leads with what would win now: most votes, else highest.
  const leading = candidates.reduce<(typeof candidates)[number] | null>((best, c) => (!best || c.votes > best.votes ? c : best), null);
  const lead = d
    ? { designation: d.designation, name: d.name, rarity: rarityOf(d.rarity) }
    : leading && { designation: leading.designation, name: leading.name, rarity: rarityOf(leading.rarity) };

  const facts: Datum[] = d
    ? [
        { label: 'Planned', value: d.plannedAt ? localTime(d.plannedAt) : '—' },
        { label: 'Cloud', value: d.cloudForecast === null ? '—' : `${d.cloudForecast}%` },
        { label: 'Live Telescope', value: node.status === 'commissioning' ? 'Coming soon' : node.status },
      ]
    : leading
      ? [
          { label: 'Highest', value: `${leading.altitudeDeg.toFixed(0)}°` },
          { label: 'At', value: localTime(leading.at) },
          ...(cast ? [{ label: 'Votes', value: `${leading.votes} of ${cast}` }] : []),
        ]
      : [];

  return (
    <SkychaserShell>
      <SkychaserView step="tonight" />


      {view && (
        <section className="sd-container sd-top sd-vote-block">
          <Chapter
            n="01"
            title={`Tonight’s vote · ${nightLabel(view.voting.night)}`}
            aside={`${cast} weighted ${cast === 1 ? 'vote' : 'votes'}`}
          />
          {view.voting.carried ? (
            <p className="sd-note">
              {view.voting.carried} takes this night, carried from a night lost to cloud. Votes count from the next.
            </p>
          ) : candidates.length === 0 ? (
            <p className="sd-note">Nothing in the set clears the horizon for the Live Telescope that night.</p>
          ) : (
            <>
              <p className="sd-strip-note">One vote per holder · every card held adds to it: commons ×1 to ×3, rares ×4, epics and legendaries ×5</p>
              <SkychaserBallot
                night={view.voting.night}
                candidates={candidates.map((c) => ({
                  designation: c.designation,
                  name: c.name,
                  rarity: rarityOf(c.rarity),
                  when: `${c.altitudeDeg.toFixed(0)}° at ${localTime(c.at)}`,
                  votes: c.votes,
                  type: SET_001_CARD_BY_DESIGNATION.get(c.designation)?.seed.objectType,
                }))}
              />
            </>
          )}
        </section>
      )}

      <section className="sd-poster sd-tonight">
        <div className="sd-sky" aria-hidden="true" />
        <div className="sd-container">

          <div className="sd-poster__grid">
            <div className="sd-poster__copy">
              <p className="sd-eyebrow">{d ? 'Tonight’s card' : leading ? (cast ? 'Leading the vote' : 'Highest tonight') : 'Live Telescope'}</p>
              <p className="sd-lead">{lead ? lead.name : 'A quiet sky.'}</p>
              <p className="sd-poster__sub">
                {d
                  ? d.basis
                  : lead
                    ? 'Holders’ votes lock tonight’s card at 13:00 UTC.'
                    : 'Nothing in the set clears the horizon for the Live Telescope.'}
              </p>
            </div>

            <div className="sd-tonight__more">
              {facts.length > 0 && <DataRow className="sd-facts" items={facts} />}
              {d && !d.capture && d.cloudForecast !== null && d.cloudForecast > CLOUD_LIMIT && (
                <p className="sd-alert">
                  <strong>Cloud is forecast over the {CLOUD_LIMIT}% limit.</strong> If it holds at {d.plannedAt ? localTime(d.plannedAt) : 'the planned hour'}, the night is lost and {d.name} is carried to the next night, if it is up — for up to three nights in a row.
                </p>
              )}
              {lastLost && (
                <p className="sd-alert">
                  <strong>{nightLabel(lastLost.night)} was lost to cloud.</strong> {lastLost.lostReason}
                </p>
              )}
              {d?.capture ? (
                <DataRow
                  className="sd-facts"
                  items={[
                    { label: 'Captured', value: `${d.capture.capturedAt.slice(11, 16)} UTC` },
                    { label: 'Exposure', value: `${d.capture.subs} × ${d.capture.exposureSec} s` },
                    { label: 'Optics', value: d.capture.opticalTrain },
                    { label: 'Provenance', value: d.capture.provenance },
                  ]}
                />
              ) : d && node.status === 'commissioning' ? (
                <p className="sd-note">Live Telescope — coming soon, first light in November. No photograph is taken yet.</p>
              ) : null}
            </div>

            {lead && (
              <div className="sd-poster__object">
                <span className="sd-poster__ghost" aria-hidden="true">
                  {lead.designation}
                </span>
                <Link href={`/card/${lead.designation}`} className="sd-poster__photo" aria-label={`${lead.name}, card page`}>
                  <ObjectPhoto designation={lead.designation} />
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {view?.voting.window && candidates.length > 0 && (
        <section className="sd-container sd-chapter-block">
          <Chapter
            n="02"
            title="Tonight’s sky"
            aside={`${localTime(view.voting.window.dusk)} – ${localTime(view.voting.window.dawn)}`}
          />
          <TonightSkyChart
            window={view.voting.window}
            candidates={candidates}
            lead={lead?.designation ?? null}
            timezone={node.timezone}
            now={now}
          />
        </section>
      )}

      {view && view.recent.length > 0 && (
        <section className="sd-container sd-chapter-block">
          <Chapter n="03" title="Past nights" />
          <ol className="sd-nights">
            {view.recent.map((r) => (
              <li key={r.night} className="sd-nights__item" data-result={r.result}>
                <Link href={`/card/${r.designation}`}>
                  <ObjectPhoto designation={r.designation} className="sd-nights__art" />
                  <span className="sd-label">{r.night}</span>
                  <span className="sd-nights__name">{r.name}</span>
                  <span className="sd-nights__result">{RESULT[r.result]}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {!view && (
        <section className="sd-container sd-chapter-block">
          <p className="sd-note">The night’s record cannot be read right now.</p>
        </section>
      )}
    </SkychaserShell>
  );
}
