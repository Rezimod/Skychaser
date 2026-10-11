'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import LiveView, { type MountSample } from '@/components/observatory/LiveView';
import { getSunAltitude } from '@/lib/dark-window';
import { DEFAULT_SEEING_ARCSEC, ROI_BY_ID, TRAIN_BY_ID, fieldOfView, resolvingPowerArcsec } from '@/lib/observatory/optics';
import { SIM_TARGET_BY_ID, targetAltAz, unattendedStack } from '@/lib/observatory/sim-targets';
import { altAzToRaDec, skyObjectsNear } from '@/lib/observatory/sky-field';
import { localSiderealHours } from '@/lib/observatory/site-time';
import type { ObservatoryNode } from '@/lib/observatory/types';

export type ScopeTarget = {
  designation: string;
  name: string;
  rarity: string;
  targetId: string;
  /** The instant the object stands highest inside the envelope tonight. */
  at: string;
  altitudeDeg: number;
  thumb: ReactNode;
};

/** The train and read-out an observer would choose — the same choices the simulator recommends. */
const SETUP: Record<string, { train: string; roi: string }> = {
  moon: { train: 'reducer', roi: 'full' },
  jupiter: { train: 'barlow2', roi: '640' },
  saturn: { train: 'barlow3', roi: '640' },
  mars: { train: 'barlow3', roi: '400' },
  venus: { train: 'barlow2', roi: '640' },
  m31: { train: 'reducer', roi: 'full' },
  m45: { train: 'reducer', roi: 'full' },
};

/** Above this the object is worth drawing at the real clock rather than at its best hour. */
const NOW_MIN_ALT = 15;

const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');

function sexagesimal(value: number, unit: 'h' | 'd'): string {
  const sign = value < 0 ? '−' : unit === 'd' ? '+' : '';
  const v = Math.abs(value);
  const a = Math.floor(v);
  const m = (v - a) * 60;
  return unit === 'h' ? `${pad(a)}h ${pad(m)}m ${pad((m % 1) * 60)}s` : `${sign}${pad(a)}° ${pad(m)}′`;
}

/** A round length for the scale bar, a fifth of the field or less. */
function scaleBar(fovArcmin: number): { arcmin: number; label: string } {
  const steps = [0.25, 0.5, 1, 2, 5, 10, 15, 20, 30, 60];
  const arcmin = [...steps].reverse().find((s) => s <= fovArcmin / 5) ?? steps[0];
  return {
    arcmin,
    label: arcmin < 1 ? `${Math.round(arcmin * 60)}″` : `${arcmin}′`,
  };
}

export default function NodeScope({
  node,
  targets,
  tonight,
  window: dark,
}: {
  node: ObservatoryNode;
  targets: ScopeTarget[];
  tonight: string | null;
  window: { dusk: string; dawn: string } | null;
}) {
  const [now, setNow] = useState<number | null>(null);
  const [since, setSince] = useState(0);
  const [selected, setSelected] = useState(
    () => targets.find((t) => t.designation === tonight)?.designation ?? targets[0]?.designation ?? null,
  );

  useEffect(() => {
    const start = Date.now();
    setSince(start);
    setNow(start);
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const chosen = targets.find((t) => t.designation === selected) ?? null;
  const sim = chosen ? (SIM_TARGET_BY_ID.get(chosen.targetId) ?? null) : null;

  // Inside the dark window with the object well up, the frame is the real
  // clock. Otherwise it is the object's best hour tonight, running on from
  // the moment the page opened so the field still drifts as a sky does.
  const mode = useMemo(() => {
    if (!now || !sim || !chosen) return null;
    const inDark = dark && now >= Date.parse(dark.dusk) && now <= Date.parse(dark.dawn);
    if (inDark && targetAltAz(sim, node, new Date(now)).altitude > NOW_MIN_ALT) return { live: true, at: now };
    return { live: false, at: Date.parse(chosen.at) + (now - since) };
  }, [now, since, sim, chosen, dark, node]);

  const date = mode ? new Date(mode.at) : null;
  const pointing = useMemo(
    () => (sim && date ? targetAltAz(sim, node, date) : { altitude: 45, azimuth: 180 }),
    [sim, node, mode?.at],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const lst = date ? localSiderealHours(node.lon, date) : 0;
  const sunAlt = date ? getSunAltitude(node.lat, node.lon, date) : -30;
  const objects = useMemo(
    () => (date ? skyObjectsNear(node, date, pointing, 1.5, lst) : []),
    // A field refreshed every few seconds is plenty; the draw loop animates between.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [node, pointing, mode ? Math.floor(mode.at / 5000) : 0],
  );
  const sample = useCallback((): MountSample => ({ pointing, azRate: 0, altRate: 0 }), [pointing]);

  const setup = SETUP[sim?.id ?? ''] ?? { train: 'native', roi: 'full' };
  const train = TRAIN_BY_ID.get(setup.train)!;
  const fov = fieldOfView(node.instrument, train, ROI_BY_ID.get(setup.roi)!);
  const stack = unattendedStack(sim?.brightness ?? 'faint');
  const eq = altAzToRaDec(pointing, node.lat, lst);
  const bar = scaleBar(fov.widthArcmin);
  const barUnits = (bar.arcmin / fov.widthArcmin) * 160;

  const siteClock = (ms: number, withSeconds = true) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: node.timezone,
      hour: '2-digit',
      minute: '2-digit',
      ...(withSeconds ? { second: '2-digit' } : {}),
      hourCycle: 'h23',
    }).format(new Date(ms));
  const exposure = stack.exposureSec < 1 ? `${Math.round(stack.exposureSec * 1000)} ms` : `${stack.exposureSec} s`;

  return (
    <div className="sd-scope">
      <div className="sd-scope__stage">
        <div className="sd-scope__frame">
          <div className="sd-scope__sky">
            {mode && sim && (
              <LiveView
                sample={sample}
                objects={objects}
                latDeg={node.lat}
                lstHours={lst}
                sunAltitudeDeg={sunAlt}
                exposureSec={stack.exposureSec}
                fovArcmin={fov.widthArcmin}
                seeingArcsec={DEFAULT_SEEING_ARCSEC}
                diffractionArcsec={resolvingPowerArcsec(node.instrument)}
                plateScaleArcsecPx={fov.plateScaleArcsecPx}
                bortle={node.bortle}
                subs={Math.min(stack.subs, 60)}
                gain={40}
                splitAt={null}
              />
            )}
          </div>
          <span className="sd-scope__vignette" aria-hidden="true" />

          <svg className="sd-scope__reticle" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <g className="sd-scope__ring">
              <circle cx="80" cy="45" r="33" />
              {Array.from({ length: 72 }, (_, i) => {
                const a = (i * 5 * Math.PI) / 180;
                const long = i % 6 === 0;
                const r1 = 33;
                const r2 = long ? 35.5 : 34.2;
                return (
                  <line
                    key={i}
                    x1={(80 + r1 * Math.cos(a)).toFixed(3)}
                    y1={(45 + r1 * Math.sin(a)).toFixed(3)}
                    x2={(80 + r2 * Math.cos(a)).toFixed(3)}
                    y2={(45 + r2 * Math.sin(a)).toFixed(3)}
                    className={long ? 'is-long' : undefined}
                  />
                );
              })}
            </g>
            <g className="sd-scope__cross">
              <line x1="80" y1="30" x2="80" y2="41" />
              <line x1="80" y1="49" x2="80" y2="60" />
              <line x1="61" y1="45" x2="76" y2="45" />
              <line x1="84" y1="45" x2="99" y2="45" />
            </g>
            <g className="sd-scope__brackets">
              <path d="M6 14 V6 H14" />
              <path d="M146 6 H154 V14" />
              <path d="M154 76 V84 H146" />
              <path d="M14 84 H6 V76" />
            </g>
            <g className="sd-scope__scale">
              <line x1={80 - barUnits / 2} y1="83" x2={80 + barUnits / 2} y2="83" />
              <line x1={80 - barUnits / 2} y1="81.8" x2={80 - barUnits / 2} y2="84.2" />
              <line x1={80 + barUnits / 2} y1="81.8" x2={80 + barUnits / 2} y2="84.2" />
            </g>
          </svg>

          <div className="sd-scope__hud sd-scope__hud--tl">
            <span className="sd-scope__tag">
              <span className="sd-scope__dot" aria-hidden="true" />
              Simulated
            </span>
            <span className="sd-scope__small">Live Telescope V1 · {node.status}</span>
          </div>

          <div className="sd-scope__hud sd-scope__hud--tr">
            {now && (
              <>
                <span className="sd-scope__clock">{siteClock(now)}</span>
                <span className="sd-scope__small">Site time</span>
              </>
            )}
          </div>

          <div className="sd-scope__hud sd-scope__hud--bl">
            {chosen && (
              <>
                <span className="sd-scope__small">
                  {chosen.designation}
                  {chosen.designation === tonight ? ' · tonight’s card' : ''}
                </span>
                <span className="sd-scope__name">{chosen.name}</span>
              </>
            )}
          </div>

          <span className="sd-scope__scale-label" aria-hidden="true">
            {bar.label}
          </span>

          <span
            key={`${selected}-${stack.exposureSec}`}
            className="sd-scope__exposure"
            style={{
              ['--sub' as string]: `${Math.min(8, Math.max(2, stack.exposureSec))}s`,
            }}
            aria-hidden="true"
          />

          {!chosen && <p className="sd-scope__empty">Nothing in the set clears the horizon for Live Telescope V1 tonight.</p>}
        </div>
        <dl className="sd-scope__coords">
          <div>
            <dt>Alt</dt>
            <dd>{pointing.altitude.toFixed(1)}°</dd>
          </div>
          <div>
            <dt>Az</dt>
            <dd>{pointing.azimuth.toFixed(1)}°</dd>
          </div>
          <div>
            <dt>RA</dt>
            <dd>{sexagesimal(eq.raHours, 'h')}</dd>
          </div>
          <div>
            <dt>Dec</dt>
            <dd>{sexagesimal(eq.decDeg, 'd')}</dd>
          </div>
        </dl>
      </div>

      <div className="sd-scope__caption sd-data">
        <span>
          {mode?.live
            ? 'As the sky stands now'
            : chosen
              ? `At ${siteClock(Date.parse(chosen.at), false)} tonight, its best hour`
              : '—'}
        </span>
        <span>{train.label}</span>
        <span>
          {stack.subs} × {exposure}
        </span>
        <span>{fov.widthArcmin >= 60 ? `${(fov.widthArcmin / 60).toFixed(2)}°` : `${fov.widthArcmin.toFixed(1)}′`} field</span>
        <span>{fov.plateScaleArcsecPx.toFixed(2)}″/px</span>
      </div>

      {targets.length > 0 && (
        <div className="sd-scope__rail" role="group" aria-label="Point Live Telescope V1 at">
          {targets.map((t) => (
            <button
              key={t.designation}
              type="button"
              className="sd-scope__pick"
              data-rarity={t.rarity}
              aria-pressed={t.designation === selected}
              onClick={() => setSelected(t.designation)}
            >
              <span className="sd-scope__thumb">{t.thumb}</span>
              <span className="sd-scope__pick-text">
                <span className="sd-scope__pick-name">{t.name}</span>
                <span className="sd-scope__pick-data">
                  {t.altitudeDeg.toFixed(0)}° at {siteClock(Date.parse(t.at), false)}
                </span>
              </span>
              {t.designation === tonight && <span className="sd-scope__pick-flag">Tonight</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
