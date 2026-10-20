// The game's guards against selection and system gestures read the element
// an event happened on. `selectstart` arrives on a text node, and the
// document or the window can be a target too: none has `closest`, and the
// guard threw on every long press over text.

import { describe, expect, it } from 'vitest';
import { attachConsoleGuards, eventElement } from '@/game/console';

describe('eventElement', () => {
  it('is the element itself, or a text node\'s parent, and nothing for the rest', () => {
    const p = document.createElement('p');
    const text = document.createTextNode('Odometer');
    p.appendChild(text);
    const on = (target: EventTarget) => { const e = new Event('x'); Object.defineProperty(e, 'target', { value: target }); return eventElement(e); };
    expect(on(p)).toBe(p);
    expect(on(text)).toBe(p);
    expect(on(document)).toBeNull();
    expect(on(window)).toBeNull();
  });

  it('lets a long press over text in the game root pass the guard without throwing', () => {
    const root = document.createElement('div');
    const span = document.createElement('span');
    span.textContent = 'Stellar Explore';
    root.appendChild(span);
    document.body.appendChild(root);
    const detach = attachConsoleGuards(root);
    const e = new Event('selectstart', { bubbles: true, cancelable: true });
    expect(() => span.firstChild!.dispatchEvent(e)).not.toThrow();
    expect(e.defaultPrevented).toBe(true);
    detach();
    root.remove();
  });
});
