'use client';

import { useEffect, useState } from 'react';

/**
 * Share a card: a post on X, written in advance, and the link to copy.
 * On a phone with a share sheet, the second button hands it to the system instead.
 */
export default function ShareCard({ title, text, url }: { title: string; text: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    setSheet(typeof navigator.share === 'function');
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  const native = async () => {
    try {
      await navigator.share({ title, text, url });
    } catch {
      /* dismissed */
    }
  };

  return (
    <div className="sn-share">
      <a
        className="sd-btn sn-share__x"
        href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="currentColor">
          <path d="M18.2 2.5h3.3l-7.2 8.2 8.5 11.3h-6.7l-5.2-6.8-6 6.8H1.6l7.7-8.8L1.2 2.5H8l4.7 6.2zm-1.2 17.5h1.8L7.1 4.4H5.1z" />
        </svg>
        Share on X
      </a>
      <button type="button" className="sd-btn" onClick={sheet ? native : copy}>
        {sheet ? (
          <>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 10.5V2M4.8 5.2 8 2l3.2 3.2M3 9v4.2h10V9" />
            </svg>
            Share
          </>
        ) : (
          <>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6.5 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-1 1M9.5 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l1-1" />
            </svg>
            {copied ? 'Copied' : 'Copy link'}
          </>
        )}
      </button>
    </div>
  );
}
