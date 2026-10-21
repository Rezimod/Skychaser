'use client';

import { useEffect, useRef, type PointerEvent } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Move } from 'lucide-react';

interface GameStickProps {
  label: string;
  onMove: (x: number, y: number) => void;
  /** The deck is drawn turned a quarter turn clockwise (landscape on a
   *  phone), so the finger's screen axes are the stick's axes rotated. */
  rotated?: boolean;
}

/** The stick reports the finger at once and zero the instant it lifts; the
 *  flight model eases what it does with that, and the thumb glides home on
 *  its own transition. Nothing here is delayed, so a release always stops. */
export function GameStick({ label, onMove, rotated = false }: GameStickProps) {
  const root = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  /** The stick's box, measured once per touch: reading it per move forces a layout. */
  const box = useRef<DOMRect | null>(null);
  const callback = useRef(onMove);
  callback.current = onMove;
  const rotatedRef = useRef(rotated);
  rotatedRef.current = rotated;

  const reset = () => {
    pointer.current = null;
    box.current = null;
    root.current?.style.setProperty('--stick-x', '0px');
    root.current?.style.setProperty('--stick-y', '0px');
    if (root.current) root.current.dataset.active = 'false';
    callback.current(0, 0);
  };
  useEffect(() => {
    const hidden = () => { if (document.hidden) reset(); };
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', hidden);
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== e.pointerId) return;
    const rect = box.current ?? e.currentTarget.getBoundingClientRect();
    const radius = rect.width * 0.32;
    let dx = (e.clientX - rect.left - rect.width / 2) / radius;
    let dy = (e.clientY - rect.top - rect.height / 2) / radius;
    // A quarter turn clockwise: the stick's right is the screen's down.
    if (rotatedRef.current) [dx, dy] = [dy, -dx];
    const length = Math.hypot(dx, dy);
    const scale = length > 1 ? 1 / length : 1;
    e.currentTarget.style.setProperty('--stick-x', `${dx * scale * radius}px`);
    e.currentTarget.style.setProperty('--stick-y', `${dy * scale * radius}px`);
    // Dead zone, then a soft curve: small corrections stay small.
    const response = length > 0.12 ? Math.pow((Math.min(1, length) - 0.12) / 0.88, 1.4) / length : 0;
    callback.current(dx * response, -dy * response);
  };
  const release = (e: PointerEvent<HTMLDivElement>) => {
    if (pointer.current === e.pointerId) reset();
  };

  return (
    <div ref={root} className="game-stick" role="group" aria-label={label} title={label}
      onPointerDown={(e) => {
        if (pointer.current !== null || e.button !== 0) return;
        e.preventDefault();
        pointer.current = e.pointerId;
        box.current = e.currentTarget.getBoundingClientRect();
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.dataset.active = 'true';
        navigator.vibrate?.(8);
        move(e);
      }}
      onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
      <span className="game-stick__axis" aria-hidden />
      {/* The four marks: a pad to look at, an analogue stick to use — a
          press on a chevron is simply a deflection that way. */}
      <span className="game-stick__pad" aria-hidden>
        <ChevronUp size={20} /><ChevronRight size={20} /><ChevronDown size={20} /><ChevronLeft size={20} />
      </span>
      <span className="game-stick__thumb" aria-hidden><Move size={22} /></span>
    </div>
  );
}

/** A key that answers the moment a finger lands, even with another thumb
 *  already on the stick — touch browsers send no click while one is held.
 *  Keyboard activation (a click with no pointer) still works. */
export function tapKey(fn: () => void) {
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      fn();
    },
    onClick: (e: React.MouseEvent<HTMLElement>) => { if (e.detail === 0) fn(); },
  };
}
