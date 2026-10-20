import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GameStick, tapKey } from '@/components/solar-system/GameStick';

beforeAll(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  if (!window.PointerEvent) {
    class TestPointerEvent extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    }
    vi.stubGlobal('PointerEvent', TestPointerEvent);
  }
  HTMLElement.prototype.setPointerCapture = vi.fn();
});
let root: Root;
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); });

function pointer(stick: Element, type: string, init: PointerEventInit) {
  act(() => { stick.dispatchEvent(new PointerEvent(type, { bubbles: true, ...init })); });
}

function setup() {
  const onMove = vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(GameStick, { label: 'Move', onMove })));
  const stick = container.firstElementChild as HTMLElement;
  vi.spyOn(stick, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 124, bottom: 124, width: 124, height: 124, toJSON: () => ({}) });
  return { stick, onMove };
}

describe('game stick', () => {
  it('ignores centre jitter and bounds diagonal movement outside the pad', () => {
    const { stick, onMove } = setup();
    pointer(stick, 'pointerdown', { pointerId: 1, button: 0, clientX: 63, clientY: 62 });
    expect(onMove).toHaveBeenLastCalledWith(0, -0);
    pointer(stick, 'pointermove', { pointerId: 1, clientX: 300, clientY: -176 });
    const [x, y] = onMove.mock.calls.at(-1)!;
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(0);
    expect(Math.hypot(x, y)).toBeCloseTo(1);
  });

  it('keeps ownership with the first finger and stops on cancellation', () => {
    const { stick, onMove } = setup();
    pointer(stick, 'pointerdown', { pointerId: 1, button: 0, clientX: 100, clientY: 62 });
    const calls = onMove.mock.calls.length;
    pointer(stick, 'pointerdown', { pointerId: 2, button: 0, clientX: 20, clientY: 62 });
    pointer(stick, 'pointerup', { pointerId: 2 });
    expect(onMove).toHaveBeenCalledTimes(calls);
    pointer(stick, 'pointercancel', { pointerId: 1 });
    expect(onMove).toHaveBeenLastCalledWith(0, 0);
    expect(stick.dataset.active).toBe('false');
  });

  it.each(['pointerup', 'lostpointercapture', 'blur', 'unmount'] as const)('clears held movement on %s', (event) => {
    const { stick, onMove } = setup();
    pointer(stick, 'pointerdown', { pointerId: 1, button: 0, clientX: 62, clientY: 0 });
    expect(onMove.mock.calls.at(-1)![1]).toBe(1);
    if (event === 'unmount') act(() => root.unmount());
    else if (event === 'blur') act(() => { window.dispatchEvent(new Event('blur')); });
    else pointer(stick, event, { pointerId: 1 });
    expect(onMove).toHaveBeenLastCalledWith(0, 0);
  });
});

describe('tap keys', () => {
  it('answer a second finger while the stick is held, once per press, and still take the keyboard', () => {
    const { stick, onMove } = setup();
    pointer(stick, 'pointerdown', { pointerId: 1, button: 0, clientX: 62, clientY: 0 });
    const fn = vi.fn();
    const holder = document.createElement('div');
    document.body.append(holder);
    const keyRoot = createRoot(holder);
    act(() => keyRoot.render(createElement('button', { type: 'button', ...tapKey(fn) }, 'Run')));
    const key = holder.firstElementChild as HTMLElement;
    pointer(key, 'pointerdown', { pointerId: 2, button: 0 });
    expect(fn).toHaveBeenCalledTimes(1);
    // The click a mouse would follow up with does not fire it twice.
    act(() => { key.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); });
    expect(fn).toHaveBeenCalledTimes(1);
    // Enter or Space on a focused key: a click with no pointer behind it.
    act(() => { key.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })); });
    expect(fn).toHaveBeenCalledTimes(2);
    // The stick never let go.
    expect(onMove.mock.calls.at(-1)![1]).toBe(1);
    act(() => keyRoot.unmount());
  });
});
