'use client';

import { Component, ReactNode } from 'react';
import StarMark from '@/components/ui/StarMark';

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-screen bg-[var(--canvas)] flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <p className="text-[var(--terracotta)] mb-4"><StarMark size={36} /></p>
            <h1 className="text-text-primary text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              Something went wrong
            </h1>
            <p className="text-text-muted text-sm mb-6 break-words">{this.state.error.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold text-black"
              style={{ background: 'linear-gradient(135deg, var(--terracotta), var(--terracotta))' }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
