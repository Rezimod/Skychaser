'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Gauge, Orbit } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { FlightSession, SpeedMode } from '@/lib/solar-system/player-ship';
import { STAR_SYSTEMS, lightYearsBetween } from '@/lib/solar-system/star-routes';
import { tapKey } from './GameStick';

interface DriveProps {
  session: FlightSession;
  paused: boolean;
  touch: boolean;
}

/** The three flown regimes, in the order the gear key walks them. */
const GEARS: SpeedMode[] = ['cruise', 'fast', 'ultra'];

const formatLy = (locale: string, n: number, unit: string) =>
  `${new Intl.NumberFormat(locale, { notation: n >= 1e5 ? 'compact' : 'standard', maximumFractionDigits: 2 }).format(n)} ${unit}`;

/** Paint a piece of the drive at ten frames a second — the telemetry is a
 *  live object, so nothing here goes through React. */
function useDrivePaint(session: FlightSession, paint: (tel: FlightSession['telemetry']) => void) {
  const ref = useRef(paint);
  ref.current = paint;
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      // Nothing moves while the deck is idle, paused, landed or in a hidden tab.
      if (now - last < 100 || !session.active || session.paused || document.hidden) return;
      last = now;
      ref.current(session.telemetry);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [session]);
}

const setText = (el: HTMLElement | null, v: string) => { if (el && el.textContent !== v) el.textContent = v; };

/** The gear: one key that walks cruise → fast → ultra and wraps, naming the
 *  regime it is in and lighting a pip for each step up. */
export function FlightGear({ session, paused, touch }: DriveProps) {
  const t = useTranslations('solarSystem.flight');
  const gearRef = useRef<HTMLButtonElement>(null);
  const modeRef = useRef<HTMLSpanElement>(null);

  useDrivePaint(session, (tel) => {
    const mode = tel.pilot === 'eva' ? 'eva' : tel.mode;
    const gear = gearRef.current;
    if (gear && gear.dataset.mode !== mode) {
      gear.dataset.mode = mode;
      const label = `${t('speedMode')} · ${t(`modes.${mode}`)}`;
      gear.setAttribute('aria-label', label);
      gear.title = label;
    }
    setText(modeRef.current, t(`modes.${mode}`));
  });

  const cycle = () => {
    const tel = session.telemetry;
    if (session.paused || tel.jumpPhase !== 'none' || tel.pilot !== 'ship') return;
    session.input.modeRequest = GEARS[(GEARS.indexOf(tel.mode) + 1) % GEARS.length];
  };

  return (
    <button ref={gearRef} type="button" className="flight-drive__gear" data-mode="cruise" {...tapKey(cycle)} disabled={paused} aria-label={t('speedMode')}>
      <Gauge size={17} aria-hidden />
      <span ref={modeRef} className="flight-drive__mode" />
      <span className="flight-drive__pips" aria-hidden><i /><i /><i /></span>
      {!touch && <kbd>1·2·3</kbd>}
    </button>
  );
}

/** The jump: a card that names where the drive is pointed and how far that
 *  is, opens the list of stars, and carries a light for the drive's state —
 *  green when it is clear to jump, amber while the pilot is out of the ship. */
export function FlightJumpCard({ session, paused }: DriveProps) {
  const t = useTranslations('solarSystem.flight');
  const locale = useLocale();
  const [menu, setMenu] = useState(false);
  const cardRef = useRef<HTMLButtonElement>(null);
  const destRef = useRef<HTMLSpanElement>(null);
  const distRef = useRef<HTMLSpanElement>(null);

  useDrivePaint(session, (tel) => {
    const state = tel.jumpPhase !== 'none' ? 'jumping' : tel.driveReady ? 'ready' : 'locked';
    if (cardRef.current) cardRef.current.dataset.state = state;
    const target = t(`systems.${tel.targetName}`);
    // The destination keeps its own line; how far it is rides with the label,
    // so a long name never breaks across the separator.
    setText(destRef.current, state === 'locked' ? t('driveLocked') : target);
    setText(distRef.current, state === 'ready' ? ` · ${formatLy(locale, tel.targetLy, t('ly'))}` : '');
  });

  const engage = (id: string) => {
    setMenu(false);
    if (session.paused) return;
    session.destination = id;
    session.input.modeRequest = 'jump';
  };
  const current = session.telemetry.systemName;

  return (
    <div className="flight-drive__jump-wrap">
      <button ref={cardRef} type="button" className="flight-hud__card flight-drive__jump" {...tapKey(() => setMenu((m) => !m))} disabled={paused} aria-expanded={menu && !paused} aria-haspopup="menu" aria-label={t('jumpLabel')}>
        <span className="flight-hud__card-icon"><Orbit size={18} aria-hidden /></span>
        <span className="flight-hud__card-text">
          <span className="flight-hud__card-label">{t('jumpShort')}<span ref={distRef} className="flight-drive__dist" /></span>
          <span ref={destRef} className="flight-hud__card-value" />
        </span>
        <ChevronRight className="flight-hud__card-go" size={16} aria-hidden />
        <span className="flight-hud__dot" aria-hidden />
      </button>
      {menu && !paused && (
        <div className="flight-drive__menu" role="menu" aria-label={t('jumpMenu')}>
          {STAR_SYSTEMS.filter((id) => id !== current).map((id) => (
            <button key={id} type="button" role="menuitem" onClick={() => engage(id)}>
              <span>{t(`systems.${id}`)}</span>
              <span className="flight-drive__ly">{formatLy(locale, lightYearsBetween(current, id), t('ly'))}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
