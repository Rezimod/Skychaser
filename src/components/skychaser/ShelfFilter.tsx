'use client';

import { useEffect, useState } from 'react';
import { RARITIES, rarityInfo } from '@/lib/rarity';
import { Search } from 'lucide-react';

const FILTERS = [{ key: 'all', label: 'All' }, ...[...RARITIES].reverse().map((rarity) => ({ key: rarity, label: rarityInfo(rarity).label }))];

/**
 * Search and families over the shelf. Each tile on the page carries
 * data-section and data-name; the filter hides the rest in place, so the
 * hundred tiles are never rendered again.
 */
export default function ShelfFilter({ total }: { total: number }) {
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

  return (
    <div className="sd-filter">
      <label className="sd-filter__search">
        <Search size={14} aria-hidden="true" />
        <input type="search" placeholder="Search the set" aria-label="Search the set" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="sd-filter__chips" role="group" aria-label="Rarity">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className="sd-filter__chip" data-rarity={f.key} aria-pressed={family === f.key} onClick={() => setFamily(f.key)}>
            {f.key !== 'all' && <i aria-hidden="true" />}
            {f.label}
          </button>
        ))}
      </div>
      <p className="sd-filter__count" aria-live="polite">
        {shown === 0 ? 'No cards match. Try another name or rarity.' : shown < total ? `${shown} of ${total} cards` : null}
      </p>
    </div>
  );
}
