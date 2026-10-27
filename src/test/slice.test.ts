import { describe, expect, it } from 'vitest';
import { BuildAborted, makeSlicer } from '@/game/slice';

describe('the build slicer', () => {
  it('runs on while inside its budget, and yields to the browser once it is used up', async () => {
    let t = 0;
    let timers = 0;
    const slice = makeSlicer(8, undefined, () => t);
    const order: string[] = [];
    setTimeout(() => { timers += 1; order.push('task'); }, 0);
    t = 3; await slice(); order.push('a');
    expect(timers).toBe(0);
    t = 10; await slice(); order.push('b');
    // Past the budget: the queued task ran before the build went on.
    expect(order).toEqual(['a', 'task', 'b']);
  });

  it('stops an abandoned build at its next slice', async () => {
    const ac = new AbortController();
    const slice = makeSlicer(8, ac.signal, () => 0);
    await slice();
    ac.abort();
    await expect(slice()).rejects.toBeInstanceOf(BuildAborted);
  });
});
