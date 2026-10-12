/** Every holder's own world, drawn from their address: a number that picks its colours and its light. */
function seedOf(address: string | null | undefined): number {
  let h = 7;
  for (const c of address ?? '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** Pairs of colours crypto already owns: Solana, Bitcoin, Ethereum, the pinks of the marketplaces, the stable greens. */
const DUOS: ReadonlyArray<readonly [string, string]> = [
  ['#9945FF', '#14F195'],
  ['#F7931A', '#FFD166'],
  ['#3C7DFF', '#B14CFF'],
  ['#FF2D8A', '#FF8A3D'],
  ['#19D3C5', '#2F6BFF'],
  ['#C7F284', '#19FB9B'],
];

/**
 * The holder's mark: a glossy sphere lit from one side in two colours of
 * their own, a rim of light along its dark edge, and a star glint.
 */
export default function HolderOrb({ address }: { address: string | null | undefined }) {
  const seed = seedOf(address);
  const [a, b] = DUOS[seed % DUOS.length];
  const flip = (seed >> 3) % 2 === 1;
  const [c1, c2] = flip ? [b, a] : [a, b];
  // Where the light falls, and where the glint sits, differ from holder to holder.
  const lx = 30 + ((seed >> 5) % 3) * 8;
  const ly = 26 + ((seed >> 8) % 3) * 6;
  const gx = 13 + ((seed >> 11) % 4) * 4;
  const gy = 11 + ((seed >> 14) % 3) * 3;
  const id = `orb${seed.toString(36)}`;
  return (
    <svg className="sd-orb" viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-duo`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
        <radialGradient id={`${id}-shade`} cx={`${lx}%`} cy={`${ly}%`} r="75%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.35" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="0.78" stopColor="#000" stopOpacity="0.3" />
          <stop offset="1" stopColor="#000" stopOpacity="0.72" />
        </radialGradient>
        <radialGradient id={`${id}-rim`} cx="50%" cy="50%" r="50%">
          <stop offset="0.82" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.96" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill={`url(#${id}-duo)`} />
      <circle cx="20" cy="20" r="19" fill={`url(#${id}-shade)`} />
      <circle cx="20" cy="20" r="19" fill={`url(#${id}-rim)`} opacity="0.7" />
      <path d={`M${gx} ${gy - 3.2} l0.9 2.3 2.3 0.9 -2.3 0.9 -0.9 2.3 -0.9 -2.3 -2.3 -0.9 2.3 -0.9z`} fill="#fff" opacity="0.95" />
    </svg>
  );
}
