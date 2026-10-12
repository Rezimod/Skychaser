'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CANCEL_HOURS, LEAD_HOURS, sessionCost, type Board, type BoardSlot, type HolderBooking, type RedeemableEdition, type SessionMinutes } from '@/lib/skychaser/booking';
import { usePrivySafe as usePrivy } from '../usePrivySafe';
import { useSkychaserHolder } from '../useSkychaserHolder';
import type { SkychaserOrder } from '../SkychaserPay';

const SkychaserPay = dynamic(() => import('../SkychaserPay'), { ssr: false });

type Mine = { balance: number; bookings: HolderBooking[]; editions: RedeemableEdition[] };
type Ticket = { id: string; at: string; minutes: SessionMinutes; targetId: string | null };

const STEP_MS = 30 * 60_000;

const clock = (iso: string, timeZone?: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const dayOf = (night: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(new Date(`${night}T00:00:00Z`));
const endOf = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60_000).toISOString();
const art = (designation: string) => `/cards/art/${designation}.webp`;

/**
 * The booking board, as one screen: a night, a start, a target, and the
 * session beside them — what it costs, what the account holds, one button.
 * Credits are bought in the same panel when they run short; an Epic card's
 * session can pay instead. Nothing here asks for a sign-in until the button.
 */
export default function BookingConsole({ board: initial }: { board: Board }) {
  const { login, getAccessToken } = usePrivy();
  const { ready, authenticated, address } = useSkychaserHolder();
  const signedIn = ready && authenticated;
  // Times are shown on the viewer's own clock; the server renders them on the telescope's until the page is up.
  const [tz, setTz] = useState(initial.node.timezone);
  useEffect(() => {
    setTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  const [board, setBoard] = useState(initial);
  const [minutes, setMinutes] = useState<SessionMinutes>(30);
  const [now, setNow] = useState(() => Date.now());
  const lead = now + LEAD_HOURS * 3_600_000;

  /** Half-hours a session of this length could start at: open, far enough ahead, and the next one open too for an hour. */
  const bookable = useCallback(
    (slots: BoardSlot[], i: number, m: SessionMinutes) => {
      const s = slots[i];
      if (s.taken || Date.parse(s.at) < lead) return false;
      if (m === 30) return true;
      const next = slots[i + 1];
      return !!next && !next.taken && Date.parse(next.at) - Date.parse(s.at) === STEP_MS;
    },
    [lead],
  );
  const openCount = useCallback((n: Board['nights'][number]) => n.slots.filter((_, i) => bookable(n.slots, i, 30)).length, [bookable]);

  const [night, setNight] = useState(() => initial.nights.find((n) => openCount(n) > 0)?.night ?? initial.nights[0]?.night ?? '');
  const [slotAt, setSlotAt] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [editionId, setEditionId] = useState<string | null>(null);
  const [mine, setMine] = useState<Mine | null>(null);
  const [sheet, setSheet] = useState(false);
  const [order, setOrder] = useState<SkychaserOrder | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const token = useRef(getAccessToken);
  useEffect(() => {
    token.current = getAccessToken;
  });
  const call = useCallback(async (path: string, body?: unknown) => {
    const bearer = await token.current();
    const res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { res, data };
  }, []);

  const refreshBoard = useCallback(async () => {
    try {
      const res = await fetch('/api/skychaser/booking', { cache: 'no-store' });
      if (res.ok) setBoard((await res.json()) as Board);
    } catch {}
  }, []);
  const refreshMine = useCallback(async () => {
    const { res, data } = await call('/api/skychaser/booking/mine');
    if (res.ok) setMine(data as Mine);
  }, [call]);

  useEffect(() => {
    if (!signedIn) {
      setMine(null);
      setEditionId(null);
      return;
    }
    void refreshMine();
  }, [signedIn, refreshMine]);

  const current = board.nights.find((n) => n.night === night) ?? board.nights[0];
  const slots = current?.slots ?? [];
  const chosenIndex = slots.findIndex((s) => s.at === slotAt);
  const chosen = chosenIndex >= 0 && bookable(slots, chosenIndex, minutes) ? slots[chosenIndex] : null;
  // What is up: at the chosen half-hour, else anywhere in the night.
  const up = useMemo(() => new Set(chosen ? chosen.up : slots.flatMap((s) => s.up)), [chosen, slots]);
  const edition = mine?.editions.find((e) => e.id === editionId) ?? null;
  const cost = sessionCost(minutes, !!edition);
  const balance = mine?.balance ?? 0;
  const short = signedIn && mine !== null && cost > balance;
  const target = board.targets.find((t) => t.id === targetId) ?? null;
  const nameOf = (id: string | null) => board.targets.find((t) => t.id === id)?.name ?? 'Operator’s pick';

  const pickMinutes = (m: SessionMinutes) => {
    setMinutes(m);
    setNote('');
    if (chosenIndex >= 0 && !bookable(slots, chosenIndex, m)) setSlotAt(null);
  };
  const pickNight = (n: string) => {
    setNight(n);
    setSlotAt(null);
    setNote('');
  };

  const bookNow = async () => {
    if (!chosen) return;
    if (short) {
      setSheet(true);
      return;
    }
    setBusy('Booking');
    setNote('');
    try {
      const { res, data } = await call('/api/skychaser/booking', { walletAddress: address, startsAt: chosen.at, minutes, targetId, editionId });
      if (!res.ok) {
        if (data.reason === 'short') setSheet(true);
        if (data.reason === 'taken') void refreshBoard();
        setNote(String(data.error ?? 'The session could not be booked.'));
        return;
      }
      setTicket({ id: String(data.id), at: chosen.at, minutes, targetId });
      setSlotAt(null);
      setEditionId(null);
      void refreshBoard();
      void refreshMine();
    } catch {
      setNote('The session could not be booked. Try again in a moment.');
    } finally {
      setBusy('');
    }
  };

  const buyPack = async (pack: string) => {
    setBusy(pack);
    setNote('');
    try {
      const { res, data } = await call('/api/skychaser/credits/buy', { pack, walletAddress: address });
      if (!res.ok) {
        setNote(String(data.error ?? 'No price can be quoted right now.'));
        return;
      }
      setOrder(data as unknown as SkychaserOrder);
    } catch {
      setNote('No price can be quoted right now. Try again in a moment.');
    } finally {
      setBusy('');
    }
  };
  const paid = () => {
    setOrder(null);
    setSheet(false);
    setNote('Credits added.');
    void refreshMine();
  };

  const cancel = async (id: string) => {
    setBusy(id);
    try {
      const { res, data } = await call('/api/skychaser/booking/cancel', { id });
      if (!res.ok) {
        setNote(String(data.error ?? 'The session could not be cancelled.'));
        return;
      }
      setMine((m) => (m ? { ...m, balance: Number(data.balance), bookings: m.bookings.filter((b) => b.id !== id) } : m));
      if (ticket?.id === id) setTicket(null);
      void refreshBoard();
      void refreshMine();
    } finally {
      setBusy('');
    }
  };

  const nightTitle = (n: string) => dayOf(n, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="sd-container sd-book">
      <header className="sd-book__head">
        <div>
          <p className="sd-eyebrow">Live Telescope V1 · from November</p>
          <h1 className="sd-book__title">Book the telescope</h1>
        </div>
        <ul className="sd-book__facts">
          <li>
            <b>30 min</b>
            <span>{board.credits[30]} credits</span>
          </li>
          <li>
            <b>60 min</b>
            <span>{board.credits[60]} credits</span>
          </li>
          <li>
            <b>Epic card</b>
            <span>30 min free</span>
          </li>
        </ul>
      </header>

      <div className="sd-book__grid">
        <div className="sd-book__pick">
          <Step title="Night" />
          <div className="sd-book__nights" role="radiogroup" aria-label="Night">
            {board.nights.map((n) => {
              const open = openCount(n);
              return (
                <button
                  key={n.night}
                  type="button"
                  role="radio"
                  aria-checked={n.night === night}
                  className={`sd-book__night${open === 0 ? ' is-full' : ''}`}
                  onClick={() => pickNight(n.night)}
                  aria-label={`${nightTitle(n.night)}, ${open === 0 ? 'full' : `${open} open`}`}
                >
                  <small>{dayOf(n.night, { weekday: 'short' })}</small>
                  <b>{dayOf(n.night, { day: 'numeric' })}</b>
                  <small>{dayOf(n.night, { month: 'short' })}</small>
                  <MoonGlyph lit={n.moon.lit} waxing={n.moon.waxing} />
                  <i>{open === 0 ? 'Full' : `${open} open`}</i>
                </button>
              );
            })}
          </div>

          <Step
            title="Start"
            aside={
              <div className="sd-book__len" role="radiogroup" aria-label="Length">
                {([30, 60] as const).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={minutes === m} onClick={() => pickMinutes(m)}>
                    {m} min <span>{board.credits[m]} cr</span>
                  </button>
                ))}
              </div>
            }
          />
          {current && (
            <div className="sd-book__slots" role="radiogroup" aria-label={`Start, ${nightTitle(current.night)}`}>
              {slots.map((s, i) => {
                const ok = bookable(slots, i, minutes);
                const past = Date.parse(s.at) < lead;
                return (
                  <button
                    key={s.at}
                    type="button"
                    role="radio"
                    aria-checked={chosen?.at === s.at}
                    className={`sd-book__slot${s.taken ? ' is-taken' : past ? ' is-past' : !ok ? ' is-short' : ''}`}
                    disabled={!ok}
                    onClick={() => {
                      setSlotAt(s.at);
                      setNote('');
                    }}
                    title={s.taken ? 'Taken' : past ? 'Too soon' : !ok ? 'No hour from here' : undefined}
                  >
                    {clock(s.at, tz)}
                  </button>
                );
              })}
              {slots.length === 0 && <p className="sd-note">No dark hours that night.</p>}
            </div>
          )}

          <Step title="Target" aside="Optional" />
          <div className="sd-book__targets" role="radiogroup" aria-label="Target">
            <button type="button" role="radio" aria-checked={targetId === null} className="sd-book__target sd-book__target--any" onClick={() => setTargetId(null)}>
              <span className="sd-book__star" aria-hidden="true">✦</span>
              <span className="sd-book__tname">Operator’s pick</span>
              <span className="sd-book__tsub">Best of the night</span>
            </button>
            {board.targets.map((t) => {
              const down = !up.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={targetId === t.id}
                  className={`sd-book__target${down ? ' is-down' : ''}`}
                  disabled={down}
                  onClick={() => setTargetId(t.id)}
                >
                  <img src={art(t.designation)} alt="" loading="lazy" decoding="async" />
                  <span className="sd-book__tname">{t.name}</span>
                  <span className="sd-book__tsub">{down ? 'Below horizon' : 'Up'}</span>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="sd-book__sum" id="session" aria-live="polite">
          {ticket ? (
            <TicketCard ticket={ticket} tz={tz} name={nameOf(ticket.targetId)} designation={board.targets.find((t) => t.id === ticket.targetId)?.designation ?? null} onAnother={() => setTicket(null)} />
          ) : sheet ? (
            <div className="sd-book__sheet">
              <div className="sd-book__sumhead">
                <span className="sd-eyebrow">Add credits</span>
                {!order && (
                  <button type="button" className="sd-book__back" onClick={() => setSheet(false)}>
                    Back
                  </button>
                )}
              </div>
              {order ? (
                <SkychaserPay order={order} onConfirmed={paid} compact />
              ) : (
                <div className="sd-book__packs">
                  {board.packs.map((p) => {
                    const off = Math.round((1 - p.usd / p.credits) * 100);
                    return (
                      <button key={p.key} type="button" className={`sd-book__pack${busy === p.key ? ' is-loading' : ''}`} onClick={() => buyPack(p.key)} disabled={!!busy || !signedIn}>
                        <b>{p.credits}</b>
                        <span>credits</span>
                        <em>${p.usd}</em>
                        {off > 0 && <i>−{off}%</i>}
                      </button>
                    );
                  })}
                  {!signedIn && (
                    <button type="button" className="sd-btn sd-btn--primary sd-btn--block" onClick={() => login()}>
                      Log in
                    </button>
                  )}
                  <p className="sd-caption">Paid in SOL at the live rate · 1 credit = $1 · credits do not expire</p>
                </div>
              )}
              {note && (
                <p className="sd-book__note" role="status">
                  {note}
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="sd-book__sumhead">
                <span className="sd-eyebrow">Your session</span>
                {signedIn && mine && (
                  <button type="button" className="sd-book__credits" onClick={() => setSheet(true)} aria-label={`${balance} credits, add more`}>
                    <b>{balance}</b> credits <span aria-hidden="true">+</span>
                  </button>
                )}
              </div>
              <dl className="sd-book__rows">
                <div>
                  <dt>Night</dt>
                  <dd>{current ? dayOf(current.night, { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}</dd>
                </div>
                <div>
                  <dt>Start</dt>
                  <dd>
                    {chosen ? `${clock(chosen.at, tz)} – ${clock(endOf(chosen.at, minutes), tz)}` : 'Pick a half-hour'}
                  </dd>
                </div>
                <div>
                  <dt>Target</dt>
                  <dd>{target ? target.name : 'Operator’s pick'}</dd>
                </div>
              </dl>

              {mine && mine.editions.length > 0 && (
                <div className="sd-book__editions">
                  <span className="sd-label">Pay with a card</span>
                  <div role="radiogroup" aria-label="Epic card session">
                    <button type="button" role="radio" aria-checked={editionId === null} onClick={() => setEditionId(null)}>
                      Credits
                    </button>
                    {mine.editions.map((e) => (
                      <button key={e.id} type="button" role="radio" aria-checked={editionId === e.id} onClick={() => setEditionId(e.id)}>
                        {e.name} <span>No. {e.editionNumber}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="sd-book__total">
                <span className="sd-label">{edition ? `${edition.name} session` : 'Cost'}</span>
                <strong>{cost === 0 ? 'Free' : `${cost} credits`}</strong>
                {signedIn && mine && cost > 0 && <span>{short ? `${cost - balance} more needed` : `${balance - cost} left after`}</span>}
              </div>

              {!signedIn ? (
                <button type="button" className="sd-btn sd-btn--primary sd-btn--block" onClick={() => login()} disabled={!ready}>
                  Log in to book
                </button>
              ) : short ? (
                <button type="button" className="sd-btn sd-btn--primary sd-btn--block" onClick={() => setSheet(true)}>
                  Add credits
                </button>
              ) : (
                <button type="button" className={`sd-btn sd-btn--primary sd-btn--block${busy === 'Booking' ? ' is-loading' : ''}`} onClick={bookNow} disabled={!chosen || !!busy}>
                  {busy === 'Booking' ? 'Booking' : chosen ? `Book ${minutes} min` : 'Pick a start'}
                </button>
              )}
              <p className="sd-caption">Cancel up to {CANCEL_HOURS} h before · credits returned</p>
              {note && (
                <p className="sd-book__note" role="status">
                  {note}
                </p>
              )}
            </>
          )}
        </aside>
      </div>

      {mine && mine.bookings.length > 0 && (
        <section className="sd-book__mine">
          <Step title="Your sessions" aside={`${mine.bookings.length}`} />
          <ol>
            {mine.bookings.map((b) => (
              <SessionRow key={b.id} booking={b} tz={tz} name={nameOf(b.targetId)} now={now} busy={busy === b.id} onCancel={() => cancel(b.id)} />
            ))}
          </ol>
        </section>
      )}

      {!ticket && !sheet && chosen && (
        <a href="#session" className="sd-book__bar" aria-label="Go to your session">
          <span>
            {clock(chosen.at, tz)} · {minutes} min
          </span>
          <b>{cost === 0 ? 'Free' : `${cost} credits`}</b>
          <span className="sd-book__bar-go">Book</span>
        </a>
      )}
    </div>
  );
}

function Step({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <header className="sd-book__step">
      <h2>{title}</h2>
      <span className="sd-book__rule" aria-hidden="true" />
      {aside && <span className="sd-book__aside">{aside}</span>}
    </header>
  );
}

/** The Moon that night: its lit part drawn on the side it is lit. */
function MoonGlyph({ lit, waxing }: { lit: number; waxing: boolean }) {
  const r = 6;
  const f = Math.max(0, Math.min(1, lit / 100));
  const rx = Math.abs(Math.cos(Math.PI * f)) * r;
  // The lit limb runs down the right; the terminator bulges toward the lit side below half, away above.
  const d = `M0,${-r} A${r},${r} 0 0 1 0,${r} A${rx},${r} 0 0 ${f < 0.5 ? 0 : 1} 0,${-r} Z`;
  return (
    <svg className="sd-book__moon" viewBox="-8 -8 16 16" width="14" height="14" aria-hidden="true">
      <circle r={r} className="sd-book__moon-dark" />
      <path d={d} className="sd-book__moon-lit" transform={waxing ? undefined : 'scale(-1 1)'} />
    </svg>
  );
}

function TicketCard({ ticket, tz, name, designation, onAnother }: { ticket: Ticket; tz: string; name: string; designation: string | null; onAnother: () => void }) {
  const start = new Date(ticket.at);
  const end = new Date(start.getTime() + ticket.minutes * 60_000);
  const ics = `data:text/calendar;charset=utf-8,${encodeURIComponent(
    ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Skychaser//Booking//EN', 'BEGIN:VEVENT', `UID:${ticket.id}@skychaser.io`, `DTSTART:${stampIcs(start)}`, `DTEND:${stampIcs(end)}`, `SUMMARY:Live Telescope V1 · ${name}`, 'LOCATION:Tbilisi', 'URL:https://skychaser.io/book', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'),
  )}`;
  return (
    <div className="sd-book__ticket">
      <span className="sd-eyebrow">Booked</span>
      <strong className="sd-book__ticket-time">
        {clock(ticket.at, tz)} – {clock(end.toISOString(), tz)}
      </strong>
      <span className="sd-book__ticket-day">{new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(start)}</span>
      <div className="sd-book__ticket-target">
        {designation ? <img src={art(designation)} alt="" /> : <span className="sd-book__star" aria-hidden="true">✦</span>}
        <span>{name}</span>
      </div>
      <a className="sd-btn sd-btn--block" href={ics} download="skychaser-session.ics">
        Add to calendar
      </a>
      <button type="button" className="sd-book__back" onClick={onAnother}>
        Book another
      </button>
    </div>
  );
}

const stampIcs = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function SessionRow({ booking, tz, name, now, busy, onCancel }: { booking: HolderBooking; tz: string; name: string; now: number; busy: boolean; onCancel: () => void }) {
  const [sure, setSure] = useState(false);
  useEffect(() => {
    if (!sure) return;
    const t = setTimeout(() => setSure(false), 4000);
    return () => clearTimeout(t);
  }, [sure]);
  const start = new Date(booking.startsAt);
  const canCancel = start.getTime() > now + CANCEL_HOURS * 3_600_000;
  return (
    <li className="sd-book__session">
      <span className="sd-book__session-when">
        <b>{clock(booking.startsAt, tz)}</b>
        <small>{new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(start)}</small>
      </span>
      <span className="sd-book__session-what">
        {name}
        <small>
          {booking.minutes} min · {booking.editionId ? 'Epic card' : `${booking.credits} credits`}
        </small>
      </span>
      {canCancel ? (
        <button type="button" className={`sd-book__cancel${sure ? ' is-sure' : ''}`} onClick={() => (sure ? onCancel() : setSure(true))} disabled={busy}>
          {busy ? 'Cancelling' : sure ? 'Confirm' : 'Cancel'}
        </button>
      ) : (
        <span className="sd-caption">Locked</span>
      )}
    </li>
  );
}
