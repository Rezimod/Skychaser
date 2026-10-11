// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('@/lib/db', () => ({ getDb: () => db }));
import { paused } from '@/lib/kill-switch';

afterEach(() => {
  delete process.env.STELLAR_PAUSED;
  db.execute.mockReset();
});

describe('the emergency pause', () => {
  it('pauses on the database flag, with no redeploy', async () => {
    db.execute.mockResolvedValue({ rows: [{ value: '1' }] });
    expect((await paused())?.status).toBe(503);
    db.execute.mockResolvedValue({ rows: [{ value: '0' }] });
    expect(await paused()).toBeNull();
  });

  it('pauses on STELLAR_PAUSED without asking the database', async () => {
    process.env.STELLAR_PAUSED = '1';
    expect((await paused())?.status).toBe(503);
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('does not pause by itself when the flag cannot be read', async () => {
    db.execute.mockRejectedValue(Object.assign(new Error('relation "app_flag" does not exist'), { code: '42P01' }));
    expect(await paused()).toBeNull();
  });
});
