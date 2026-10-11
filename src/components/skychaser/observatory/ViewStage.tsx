'use client';

import { memo, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import Icon from './icons';
import SlewField, { type SlewPan } from './SlewField';
import { plateArt } from './sky';

export type Train = 'reducer' | 'native' | 'barlow2';
export const TRAIN_K: Record<Train, number> = { reducer: 0.7, native: 1, barlow2: 1.9 };
/** On target the camera runs planetary exposures: the sky goes black and only the stars stay. */
export const LOCKED_FEED_FILTER = 'contrast(1.35) brightness(.9)';
/** What a backyard telescope actually shows: small, soft and warm, not the space-telescope photo on the card. */
export const SCOPE_VIEW: Record<string, string> = { SATURN: '/cards/scope/saturn.webp?v=1' };
const TRAIN_LABEL: Record<Train, [string, string]> = { reducer: ['0.63×', 'Focal reducer'], native: ['1×', 'Native'], barlow2: ['2×', 'Barlow'] };

const RULER = (() => {
  const lines: string[] = [];
  for (let i = 0; i <= 900; i += 15) {
    const L = i % 150 === 0 ? 9 : 4;
    lines.push(`M${i} 0v${L}M${i} 600v-${L}`);
  }
  for (let i = 0; i <= 600; i += 15) {
    const L = i % 150 === 0 ? 9 : 4;
    lines.push(`M0 ${i}h${L}M900 ${i}h-${L}`);
  }
  return lines.join('');
})();

function Reticle() {
  return (
    <svg className="sdo-overlay" viewBox="0 0 900 600" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g fill="none">
        <path d="M450 40v160M450 400v160M120 300h200M580 300h200" stroke="rgba(244, 244, 242, .22)" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}

export type ViewStageProps = {
  viewRef: RefObject<HTMLDivElement | null>;
  feed: ReactNode | null;
  backdrop: string;
  plate: string | null;
  /** pan: the mount is slewing and the object is on its way in; sharp: it is in the field. */
  art: 'none' | 'pan' | 'sharp';
  /** Where the object sits from the centre of the field, degrees on the sky (x right, y up). */
  offsetDeg: { x: number; y: number };
  /** Width of the camera frame on the sky, degrees. */
  fovDeg: number;
  pan: SlewPan | null;
  train: Train;
  onTrain: (t: Train) => void;
  reticle: boolean;
  onReticle: () => void;
  labels: boolean;
  onLabels: () => void;
  full: boolean;
  onFull: () => void;
  status: { text: string; go: boolean; blink: boolean };
  hudLive: [string, string, string];
  hudTarget: [string, string] | null;
  hudField: [string, string];
  idle: { title: string; text: string } | null;
  /** The object in the eyepiece: its photograph, or the drawn plate where there is none. */
  objectSrc: string | null;
  /** objectSrc is a true-scale telescope view, drawn small in the field. */
  scope: boolean;
};

function ViewStage(p: ViewStageProps) {
  const k = TRAIN_K[p.train];
  const stageRef = useRef<HTMLElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [p.full]);
  // The feed is a 16:9 frame covering the view, so the sky's scale follows the wider of the two.
  const feedW = Math.max(size.w, (size.h * 16) / 9);
  const pxPerDeg = feedW / p.fovDeg;
  const feedStyle = {
    ...(feedW > 0 ? { inset: 'auto', left: '50%', top: '50%', width: feedW, height: (feedW * 9) / 16, transform: 'translate(-50%, -50%)' } : {}),
    ...(p.art !== 'none' ? { filter: LOCKED_FEED_FILTER } : {}),
  };
  const artStyle = { transform: `translate(${(p.offsetDeg.x * pxPerDeg).toFixed(1)}px, ${(-p.offsetDeg.y * pxPerDeg).toFixed(1)}px) scale(${k})` };
  const trains = (Object.keys(TRAIN_K) as Train[]).map((t) => (
    <button key={t} type="button" className={p.train === t ? 'is-on' : ''} aria-pressed={p.train === t} title={TRAIN_LABEL[t][1]} onClick={() => p.onTrain(t)}>
      {TRAIN_LABEL[t][0]}
    </button>
  ));
  const toggles = (
    <>
      <button className={`sdo-ib${p.reticle ? ' is-on' : ''}`} type="button" onClick={p.onReticle} aria-pressed={p.reticle} aria-label="Reticle" title="Reticle"><Icon name="target" /></button>
      <button className={`sdo-ib${p.labels ? ' is-on' : ''}`} type="button" onClick={p.onLabels} aria-pressed={p.labels} aria-label="Survey labels" title="Survey labels"><Icon name="layers" /></button>
    </>
  );

  return (
    <section ref={stageRef} className={`sdo-view${p.full ? ' is-full' : ''}${p.status.go ? ' is-go' : ''}`} aria-label="Telescope view">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="sdo-view__sky" src={p.backdrop} alt="" />
      <div className="sdo-view__feed" ref={p.viewRef} style={feedStyle}>{p.feed}</div>
      {p.pan && p.art === 'pan' && <SlewField pan={p.pan} artRef={artRef} />}
      {p.objectSrc && p.art !== 'none' && (
        <div ref={artRef} className={`sdo-art sdo-art--photo${p.scope ? ' is-scope' : ''}${p.art === 'pan' ? ' is-pan' : ''}`} style={artStyle}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.objectSrc} alt="" />
        </div>
      )}
      {p.art !== 'none' && <div className="sdo-skyglow" />}
      {p.reticle && p.art !== 'none' && <Reticle />}
      <svg className="sdo-overlay" viewBox="0 0 900 600" preserveAspectRatio="none" aria-hidden="true">
        <path d={RULER} stroke="rgba(244, 244, 242, .35)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="sdo-scan" />
      <div className="sdo-vignette" />
      {p.plate && p.labels && p.art === 'sharp' && (
        <div className="sdo-art" style={{ transform: `scale(${(k * 0.86).toFixed(2)})` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={plateArt(p.plate, 'survey')} alt="" />
        </div>
      )}

      <div className="sdo-tools sdo-glass">
        <span className="sdo-lbl">Optics</span>
        <div className="sdo-seg" role="group" aria-label="Optical train">{trains}</div>
        <span className="sdo-tools__sep" />
        {toggles}
        <button className={`sdo-ib${p.full ? ' is-on' : ''}`} type="button" onClick={p.onFull} aria-pressed={p.full} aria-label="Full view" title="Full view (F)"><Icon name="expand" /></button>
      </div>

      <div className="sdo-status" role="status">
        <span className={`sdo-pill sdo-glass${p.status.go ? ' is-go' : ''}`}>
          <span className={`sdo-led ${p.status.go ? 'is-go' : 'is-hold'}${p.status.blink ? ' sdo-blink' : ''}`} />
          {p.status.text}
        </span>
      </div>
      <div className="sdo-hud sdo-glass sdo-hud--tl"><span style={{ color: '#f0785a' }}>{p.hudLive[0]}</span> · {p.hudLive[1]}<br />{p.hudLive[2]}</div>
      {p.hudTarget && (
        <div className="sdo-hud sdo-glass sdo-hud--bl"><span style={{ color: '#b8321f' }}>{p.hudTarget[0]}</span><br />{p.hudTarget[1]}</div>
      )}
      <div className="sdo-hud sdo-glass sdo-hud--br">{p.hudField[0]}<br />{p.hudField[1]}</div>

      {p.idle && (
        <div className="sdo-idle sdo-glass">
          <span className="sdo-idle__icon"><Icon name="camera" size={24} /></span>
          <p className="sdo-idle__title">{p.idle.title}</p>
          <p className="sdo-idle__text">{p.idle.text}</p>
        </div>
      )}

      <div className="sdo-phone sdo-pbar sdo-glass">
        <div className="sdo-seg" role="group" aria-label="Optical train">{trains}</div>
        <div>{toggles}</div>
      </div>
    </section>
  );
}

export default memo(ViewStage);
