'use client';

// The world's own error boundary. Without it an error anywhere in the world
// (a scene that cannot be built, a chunk that will not load) reaches the
// site's root boundary, which replaces the whole game with a "Reload" page:
// to a player, the game restarting by itself. Here the shell stays, and the
// player is offered a fresh orbit or the title. It is keyed by the game's
// generation, so either way out starts it clean.

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  labels: { title: string; body: string; retry: string; toTitle: string };
  onRetry: () => void;
  onTitle: () => void;
}
interface State { error: Error | null }

export class GameBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[game] the world failed', error);
    if (typeof window !== 'undefined') {
      const w = window as Window & { __stellarGameErrors?: string[] };
      (w.__stellarGameErrors ??= []).push(String(error?.message ?? error));
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    const { labels, onRetry, onTitle } = this.props;
    return (
      <div className="game-menu game-pause" role="alertdialog" aria-label={labels.title}>
        <div className="game-menu__panel">
          <p className="game-pause__title font-display">{labels.title}</p>
          <p className="game-pause__hint">{labels.body}</p>
          <div className="game-menu__list">
            <button type="button" className="game-menu__item game-menu__item--primary" onClick={onRetry} autoFocus><span>{labels.retry}</span></button>
            <button type="button" className="game-menu__item" onClick={onTitle}><span>{labels.toTitle}</span></button>
          </div>
        </div>
      </div>
    );
  }
}
