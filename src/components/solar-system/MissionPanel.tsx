'use client';

import { useTranslations } from 'next-intl';
import { ArrowUpRight, Check, Circle, Lock, Trophy } from 'lucide-react';
import { MOON_MISSIONS } from '@/lib/solar-system/moon-missions';
import { CRATER, RIDGE } from '@/lib/solar-system/moon-mission-props';
import { TELESCOPE_PAD, TERRAIN_WALK_RADIUS } from '@/lib/solar-system/moon-terrain';
import type { MissionsTelemetry } from '@/lib/solar-system/missions';
import type { Achievement } from '@/lib/solar-system/achievements';

interface MissionPanelProps {
  missions: MissionsTelemetry;
  /** Where the crew is standing, for the map. */
  crew: { x: number; z: number };
  /** Rewards from the old expedition and the side jobs, kept in the same list. */
  extras: { key: string; label: string }[];
  /** What the crew did, as records: no Stars, nothing minted. */
  achievements: Achievement[];
}

const fmtRange = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
/** The day it happened, the same on every device and in every locale. */
const fmtDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** `explore.telescope_calibrated` → `telescope_calibrated`. */
const slug = (id: string) => id.split('.').pop() ?? id;
/** World metres → per cent across the map, north up, east right. */
const mapX = (x: number) => 50 + (x / TERRAIN_WALK_RADIUS) * 46;
const mapY = (z: number) => 50 + (z / TERRAIN_WALK_RADIUS) * 46;

/** The places worth knowing on the map, in the base's own coordinates. */
const LANDMARKS: { id: string; x: number; z: number }[] = [
  { id: 'base', x: 0, z: 0 },
  { id: 'telescope', x: TELESCOPE_PAD.x, z: TELESCOPE_PAD.z },
  { id: 'ridge', ...RIDGE },
  { id: 'crater', ...CRATER },
];

export function MissionPanel({ missions, crew, extras, achievements }: MissionPanelProps) {
  const t = useTranslations('solarSystem.moon');
  const active = MOON_MISSIONS.find((m) => m.id === missions.active);
  const done = new Set(missions.done);
  const statusOf = (id: string) => {
    if (done.has(id)) return 'done';
    if (id === missions.active) return 'active';
    const m = MOON_MISSIONS.find((x) => x.id === id);
    return (m?.requires ?? []).every((r) => done.has(r)) ? 'open' : 'locked';
  };
  // The objective's own spot, back out of the range and bearing the engine gives.
  const openIndex = active ? active.objectives.findIndex((o) => o.id === missions.objective) : -1;
  const target = missions.distance >= 0
    ? { x: crew.x + Math.sin(missions.bearing) * missions.distance, z: crew.z + Math.cos(missions.bearing) * missions.distance }
    : null;

  return (
    <div className="moon-log">
      <ol className="moon-log__list">
        {MOON_MISSIONS.map((m) => {
          const status = statusOf(m.id);
          return (
            <li key={m.id} className={`moon-log__item moon-log__item--${status}`}>
              <span className="moon-log__icon" aria-hidden>
                {status === 'done' ? <Check size={13} /> : status === 'locked' ? <Lock size={13} /> : <Circle size={13} />}
              </span>
              <span className="moon-log__name">{t(`missions.${m.id}.title`)}</span>
              <span className="moon-log__status">{t(`missions.status.${status}`)}</span>
            </li>
          );
        })}
      </ol>

      {active ? (
        <div className="moon-log__active">
          <h4>{t(`missions.${active.id}.title`)}</h4>
          <p className="moon-log__brief">{t(`missions.${active.id}.brief`)}</p>
          <ol className="moon-log__objectives">
            {active.objectives.map((o, i) => {
              const state = missions.objectives[i];
              const isOpen = i === openIndex;
              return (
                <li key={o.id} className={`moon-log__objective${state?.done ? ' is-done' : ''}${isOpen ? ' is-open' : ''}`}>
                  <span>{t(`missions.${active.id}.${o.id}`)}</span>
                  {state && state.required > 1 && !state.done && <b>{state.progress}/{state.required}</b>}
                  {isOpen && missions.distance >= 0 && <b>{fmtRange(missions.distance)}</b>}
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <p className="moon-log__brief">{t('missions.none')}</p>
      )}

      <div className="moon-log__map" role="img" aria-label={t('missions.map')}>
        {LANDMARKS.map((l) => (
          <i key={l.id} className="moon-log__mark" style={{ left: `${mapX(l.x)}%`, top: `${mapY(l.z)}%` }} />
        ))}
        {target && <i className="moon-log__mark moon-log__mark--target" style={{ left: `${mapX(target.x)}%`, top: `${mapY(target.z)}%` }} />}
        <i className="moon-log__mark moon-log__mark--crew" style={{ left: `${mapX(crew.x)}%`, top: `${mapY(crew.z)}%` }} />
      </div>

      {achievements.length > 0 && (
        <div className="moon-log__records">
          <h5>{t('missions.records.title')}</h5>
          {achievements.map((a) => (
            <p key={a.id} className="moon-log__record">
              <span>{t(`missions.records.${slug(a.id)}`)}</span>
              <time dateTime={fmtDay(a.at)}>{fmtDay(a.at)}</time>
              {a.detail && (
                <a href="/sky" target="_blank" rel="noreferrer">
                  {t('missions.records.tonight', { target: t(`missions.observed.names.${a.detail}`) })}
                  <ArrowUpRight size={12} aria-hidden />
                </a>
              )}
            </p>
          ))}
          <p className="moon-log__records-note">{t('missions.records.note')}</p>
        </div>
      )}

      <div className="moon-log__rewards">
        {missions.rewards.length === 0 && extras.length === 0 && <p>{t('missions.none')}</p>}
        {missions.rewards.map((r) => (
          <p key={r} className="moon-hud__reward"><Trophy size={14} aria-hidden /><span>{t(`mission.rewards.${r}`)}</span></p>
        ))}
        {extras.map((e) => (
          <p key={e.key} className="moon-hud__reward"><Trophy size={14} aria-hidden /><span>{e.label}</span></p>
        ))}
      </div>
    </div>
  );
}
