'use client';

import { useEffect, useRef, useState } from 'react';
import { Hammer, LogIn, Plus, RotateCw, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePrivy } from '@privy-io/react-auth';
import type { BuildHandle, BuildTelemetry } from '@/lib/solar-system/build-mode';
import { makeBuildSync, type BuildSync, type SyncState } from '@/lib/solar-system/build-sync';
import { CAPS, MODULE_SPECS, moduleSpec, type BuildWorld } from '@/lib/solar-system/build-rules';
import { claimEscape } from '@/game/escape';
import { tapKey } from './GameStick';

interface BuildHudProps {
  world: BuildWorld;
  /** The scene's build handle; null until the scene is built (and after it is torn down). */
  getBuild: () => BuildHandle | null;
  /** The crew is on foot on the surface: build mode may open. */
  canOpen: () => boolean;
  mount: React.RefObject<HTMLDivElement | null>;
  paused: boolean;
  touch: boolean;
}

type View = Omit<BuildTelemetry, 'mine'> & { minePrivate: number; mineColony: number };
const snapshot = (t: BuildTelemetry): View => {
  const { mine, ...rest } = t;
  return { ...rest, colonyDistance: Math.round(rest.colonyDistance), colonyBearing: Math.round(rest.colonyBearing / 5) * 5, minePrivate: mine.private, mineColony: mine.colony };
};
const same = (a: View | null, b: View) => !!a && (Object.keys(b) as (keyof View)[]).every((k) => a[k] === b[k]);

/** Build mode's controls on the glass: the toggle, the catalogue, the scope, and what is wrong with the spot. */
export function BuildHud({ world, getBuild, canOpen, mount, paused, touch }: BuildHudProps) {
  const t = useTranslations('solarSystem.build');
  const { authenticated, getAccessToken, login } = usePrivy();
  const [view, setView] = useState<View | null>(null);
  const [sync, setSync] = useState<SyncState>({ status: 'loading', signedIn: false, refused: '' });
  const buildRef = useRef<BuildHandle | null>(null);
  const syncRef = useRef<BuildSync | null>(null);
  const authRef = useRef({ authenticated, getAccessToken });
  authRef.current = { authenticated, getAccessToken };
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const canOpenRef = useRef(canOpen);
  canOpenRef.current = canOpen;

  // Follow the scene: a new build handle (a rebuilt scene) gets its own sync.
  useEffect(() => {
    const tick = () => {
      const b = getBuild();
      if (b !== buildRef.current) {
        syncRef.current?.dispose();
        buildRef.current = b;
        syncRef.current = b ? makeBuildSync({
          world, build: b, onState: setSync,
          token: () => (authRef.current.authenticated ? authRef.current.getAccessToken() : Promise.resolve(null)),
        }) : null;
      }
      if (!b) { setView(null); return; }
      b.setLocked(!(syncRef.current?.canBuild() ?? false));
      const next = snapshot(b.telemetry);
      setView((v) => (same(v, next) ? v : next));
    };
    const id = window.setInterval(tick, 120);
    tick();
    return () => {
      window.clearInterval(id);
      syncRef.current?.dispose();
      syncRef.current = null;
      buildRef.current = null;
    };
  }, [world, getBuild]);
  useEffect(() => { syncRef.current?.refresh(); }, [authenticated]);

  // Keys: B opens and closes; while open, R turns, 1–6 pick, T swaps scope, X removes; Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const b = buildRef.current;
      if (!b || pausedRef.current || e.repeat) return;
      if (e.code === 'KeyB') { if (b.telemetry.active || canOpenRef.current()) b.toggle(); return; }
      if (!b.telemetry.active) return;
      if (e.code === 'KeyR') b.rotate();
      else if (e.code === 'KeyT') b.setScope(b.telemetry.scope === 'private' ? 'colony' : 'private');
      else if (e.code === 'KeyX' || e.code === 'Backspace' || e.code === 'Delete') { e.preventDefault(); b.remove(); }
      else if (/^Digit[1-6]$/.test(e.code)) b.select(MODULE_SPECS[Number(e.code.slice(5)) - 1].id);
    };
    window.addEventListener('keydown', onKey);
    const release = claimEscape(() => {
      const b = buildRef.current;
      if (!b?.telemetry.active) return false;
      b.setActive(false);
      return true;
    });
    return () => { window.removeEventListener('keydown', onKey); release(); };
  }, []);

  // A click or a tap on the scene (not a drag to look round) places.
  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    let downAt = 0; let x = 0; let y = 0;
    const down = (e: PointerEvent) => { if (e.button === 0) { downAt = performance.now(); x = e.clientX; y = e.clientY; } };
    const up = (e: PointerEvent) => {
      const b = buildRef.current;
      if (!b?.telemetry.active || e.button !== 0 || pausedRef.current) return;
      if (performance.now() - downAt < 350 && Math.hypot(e.clientX - x, e.clientY - y) < 10) b.place();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up); };
  }, [mount]);

  const b = () => buildRef.current;
  const toggle = () => { const h = b(); if (h && (h.telemetry.active || canOpen())) h.toggle(); };
  const toggleButton = (
    <button type="button" className="moon-hud__round build-hud__toggle" data-on={!!view?.active} {...tapKey(toggle)}
      aria-pressed={!!view?.active} aria-label={t('toggle')} title={`${t('toggle')} (B)`}>
      <Hammer size={18} aria-hidden />
    </button>
  );
  if (!view?.active) return toggleButton;

  const mineHere = view.scope === 'private' ? view.minePrivate : view.mineColony;
  const name = (id: string) => t(`modules.${moduleSpec(id)?.nameKey ?? 'habitat'}`);
  const needsSignIn = view.locked;
  const status = needsSignIn ? t('signIn')
    : sync.refused ? t(`refused.${sync.refused}`)
    : view.hover ? t(view.hoverMine ? 'hoverMine' : 'hoverOther', { name: name(view.hoverModule) })
    : view.scope === 'colony' && view.colonyDistance > 0 ? t('colonyAway', { n: view.colonyDistance, deg: view.colonyBearing })
    : view.problem ? t(view.problem === 'site' ? (view.scope === 'colony' ? 'problem.siteColony' : 'problem.sitePrivate') : `problem.${view.problem}`)
    : t('ready');
  const bad = needsSignIn || !!sync.refused || (!view.hover && !!view.problem);

  return (
    <>
      {toggleButton}
      <div className="build-hud" role="dialog" aria-label={t('title')}>
        <div className="build-hud__head">
          <span>{t('title')} · {t(world === 'moon' ? 'worldMoon' : 'worldMars')}</span>
          <button type="button" {...tapKey(toggle)} aria-label={t('close')} title={t('close')}><X size={14} aria-hidden /></button>
        </div>
        <div className="build-hud__scopes" role="radiogroup" aria-label={t('scopeHint')}>
          {(['private', 'colony'] as const).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={view.scope === s} data-on={view.scope === s} {...tapKey(() => b()?.setScope(s))}>
              {t(s === 'private' ? 'scopePrivate' : 'scopeColony')}
            </button>
          ))}
        </div>
        <div className="build-hud__modules">
          {MODULE_SPECS.map((m, i) => (
            <button key={m.id} type="button" data-on={view.module === m.id} aria-pressed={view.module === m.id} {...tapKey(() => b()?.select(m.id))}>
              {!touch && <kbd>{i + 1}</kbd>}<span>{t(`modules.${m.nameKey}`)}</span><small>{t('size', { w: m.w, d: m.d })}</small>
            </button>
          ))}
        </div>
        <div className="build-hud__count">
          <span>{t('count', { n: mineHere, cap: CAPS[view.scope] })}</span>
          {view.scope === 'colony' && <span>{t('colonyCount', { n: view.colonyTotal })}</span>}
        </div>
        <p className="build-hud__status" data-bad={bad} role="status">{status}</p>
        {needsSignIn && (
          <button type="button" className="build-hud__signin" onClick={() => login()}><LogIn size={14} aria-hidden /><span>{t('signInButton')}</span></button>
        )}
        <p className="build-hud__save" data-state={sync.status}>{sync.status === 'offline' ? t('offline') : sync.status === 'loading' ? t('loading') : sync.signedIn ? t('saved') : ''}</p>
        {touch ? (
          <div className="build-hud__actions">
            <button type="button" {...tapKey(() => b()?.rotate())}><RotateCw size={16} aria-hidden /><span>{t('rotate')}</span></button>
            <button type="button" data-kind="remove" disabled={!view.hoverMine} {...tapKey(() => b()?.remove())}><Trash2 size={16} aria-hidden /><span>{t('remove')}</span></button>
            <button type="button" data-kind="place" disabled={!view.valid} {...tapKey(() => b()?.place())}><Plus size={16} aria-hidden /><span>{t('place')}</span></button>
          </div>
        ) : <p className="build-hud__keys">{t('keys')}</p>}
      </div>
    </>
  );
}
