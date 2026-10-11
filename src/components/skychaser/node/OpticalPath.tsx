import type { Instrument } from '@/lib/observatory/types';

/** Rays entering the corrector, as heights on the drawing; the axis is at 130. */
const RAYS = [74, 96, 164, 186];
const AXIS = 130;
const PRIMARY_X = 686;
const SECONDARY_X = 132;
const FOCUS_X = 752;

/**
 * The light path through a Schmidt–Cassegrain, drawn to explain the numbers
 * beside it: the corrector admits the light, the primary folds it back, the
 * secondary sends it through the hole in the primary to the sensor. Schematic,
 * not to scale.
 */
export default function OpticalPath({ instrument }: { instrument: Instrument }) {
  const fRatio = instrument.focalLengthMm / instrument.apertureMm;
  return (
    <figure className="sd-optic">
      <svg
        viewBox="0 0 900 270"
        role="img"
        aria-label={`Light path through the ${instrument.optics}, a Schmidt–Cassegrain telescope.`}
      >
        <defs>
          <linearGradient id="sd-optic-tube" x1="0" x2="1">
            <stop offset="0" stopColor="rgba(255,255,255,0.06)" />
            <stop offset="1" stopColor="rgba(255,255,255,0.015)" />
          </linearGradient>
        </defs>

        <rect className="sd-optic__tube" x="120" y="56" width="580" height="148" rx="10" fill="url(#sd-optic-tube)" />
        <line className="sd-optic__axis" x1="20" y1={AXIS} x2="880" y2={AXIS} />

        {RAYS.map((y) => {
          const toSecondary = y < AXIS ? AXIS - 7 : AXIS + 7;
          const d = `M20 ${y} L${PRIMARY_X} ${y} L${SECONDARY_X} ${toSecondary} L${FOCUS_X} ${AXIS}`;
          return (
            <g key={y}>
              <path className="sd-optic__ray" d={d} />
              <path className="sd-optic__photon" d={d} pathLength={100} />
            </g>
          );
        })}

        <line className="sd-optic__glass" x1="120" y1="58" x2="120" y2="202" />
        <rect className="sd-optic__secondary" x={SECONDARY_X - 6} y={AXIS - 14} width="6" height="28" rx="2" />
        <path className="sd-optic__mirror" d={`M${PRIMARY_X} 60 Q${PRIMARY_X + 14} ${AXIS} ${PRIMARY_X} 200`} />
        <line className="sd-optic__hole" x1={PRIMARY_X + 4} y1={AXIS - 9} x2={PRIMARY_X + 4} y2={AXIS + 9} />
        <rect className="sd-optic__camera" x="738" y="108" width="72" height="44" rx="6" />
        <circle className="sd-optic__focus" cx={FOCUS_X} cy={AXIS} r="3.5" />

        <g className="sd-optic__labels">
          <text x="120" y="36" textAnchor="middle">
            Corrector
          </text>
          <text x={SECONDARY_X + 4} y="236" textAnchor="middle">
            Secondary
          </text>
          <text x={PRIMARY_X} y="36" textAnchor="middle">
            Primary · {instrument.apertureMm} mm
          </text>
          <text x="774" y="176" textAnchor="middle">
            Sensor
          </text>
          <text x="410" y="236" textAnchor="middle">
            {instrument.focalLengthMm} mm · f/{fRatio.toFixed(0)}
          </text>
        </g>
      </svg>
    </figure>
  );
}
