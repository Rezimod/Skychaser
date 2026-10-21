// The game talks to sign-in only through src/game/account.ts, so the same
// game runs on the Stellar platform and on a host without accounts.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NO_ACCOUNT } from '@/game/account';

const ROOT = path.resolve(__dirname, '..');
const GAME_DIRS = ['game', 'lib/solar-system', 'lib/multiplayer', 'components/play', 'components/solar-system'];
/** The one file each host may use to plug its own sign-in in. */
const HOST_ADAPTERS = new Set(['components/play/StellarAccount.tsx']);

function files(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return files(rel);
    return /\.(ts|tsx)$/.test(e.name) ? [rel] : [];
  });
}

describe('the game and sign-in', () => {
  it('never imports a sign-in library outside the host adapter', () => {
    const offenders = GAME_DIRS.flatMap(files)
      .filter((f) => !HOST_ADAPTERS.has(f))
      .filter((f) => /from ['"]@privy-io\//.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('has a signed-out default that keeps everything on the device', async () => {
    expect(NO_ACCOUNT.available).toBe(false);
    expect(NO_ACCOUNT.authenticated).toBe(false);
    expect(NO_ACCOUNT.wallet).toBeNull();
    await expect(NO_ACCOUNT.getAccessToken()).resolves.toBeNull();
    expect(() => NO_ACCOUNT.login()).not.toThrow();
  });
});
