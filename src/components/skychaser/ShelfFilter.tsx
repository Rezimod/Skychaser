'use client';

import { useEffect, useState } from 'react';
import { RARITIES, rarityInfo } from '@/lib/rarity';
import { Search, X } from 'lucide-react';

const FILTERS = [{ key: 'all', label: 'All' }, ...[...RARITIES].reverse().map((rarity) => ({ key: rarity, label: rarityInfo(rarity).label }))];

/**
 * The shelf's head: its title, one status line, the search and the rarities.
 * Each tile on the page carries data-rarity and data-name; the filter hides
 * the rest in place, so the hundred tiles are never rendered again. Nothing
 * here moves when a rarity is chosen: the status line swaps its words in the
 * same place and the chips only change colour.
 */
export default function ShelfFilter({ title, meta, total }: { title: string; meta: string; total: number }) {
  const [family, setFamily] = useState('all');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(total);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    let n = 0;
    for (const t of document.querySelectorAll<HTMLElement>('[data-shelf-item]')) {
      const show = (family === 'all' || t.dataset.rarity === family) && (!q || t.dataset.name!.includes(q));
      t.hidden = !show;
      if (show) n++;
    }
    setShown(n);
  }, [family, query]);

  const filtered = shown < total;

  return (
    <header className="sd-fl__head">
      <div className="sd-fl__heading">
        <h1 className="sd-fl__title" id="fl-title">
          {title}
        </h1>
        <p className="sd-fl__meta" data-filtered={filtered || undefined} aria-live="polite">
          {shown === 0 ? 'No cards match. Try another name or rarity.' : filtered ? `${shown} of ${total} cards` : meta}
        </p>
      </div>
      <div className="sd-filter">
        <label className="sd-filter__search">
          <Search size={15} aria-hidden="true" />
          <input type="search" placeholder="Search the set" aria-label="Search the set" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <button type="button" className="sd-filter__clear" aria-label="Clear the search" onClick={() => setQuery('')}>
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </label>
        <div className="sd-filter__chips" role="group" aria-label="Rarity">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className="sd-filter__chip" data-rarity={f.key} aria-pressed={family === f.key} onClick={() => setFamily(f.key)}>
              {f.key !== 'all' && <i aria-hidden="true" />}
              {f.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
