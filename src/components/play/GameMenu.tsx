'use client';

import type { ReactNode } from 'react';
import { CosmicSky, CosmicSystem } from '@/components/solar-system/CosmicLoader';

interface GameMenuProps {
  className: string;
  ariaLabel: string;
  children: ReactNode;
  /** What stands behind the menu: the loader's Earth and Moon turning, or
   *  the title's horizon — a world rising out of the bottom of the glass,
   *  the Sun just over its limb. */
  backdrop?: 'system' | 'horizon';
}

/** The sky behind every full-screen menu: the loader's own starfield, a
 *  drifting nebula, and either the Earth and the Moon turning in it or a
 *  world's horizon. All CSS, no canvas; every moving part is a transform or
 *  an opacity, so it keeps moving on the compositor. */
export function GameMenu({ className, ariaLabel, children, backdrop = 'system' }: GameMenuProps) {
  return (
    <div className={`game-menu ${className}`} role="dialog" aria-label={ariaLabel} data-backdrop={backdrop}>
      <CosmicSky />
      {backdrop === 'system' ? <CosmicSystem className="game-menu__orrery" /> : (
        <span className="game-menu__horizon" aria-hidden>
          <span className="game-menu__sunrise" />
          <span className="game-menu__planet">
            <i className="game-menu__map" />
            <i className="game-menu__lights" />
            <i className="game-menu__clouds" />
            <i className="game-menu__shade" />
          </span>
          <span className="game-menu__air" />
          <span className="game-menu__meteor" />
        </span>
      )}
      <div className="game-menu__panel">{children}</div>
    </div>
  );
}
