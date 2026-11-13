/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { SHORTS_CATEGORIES, categoryIdForSource, sourceFromCategoryId } from '../../../lib/shorts/shortsCategories.js';

/**
 * Always-visible category chips under the player so people can switch type
 * of Shorts without opening the search sheet (NASA is no longer the only
 * obvious choice).
 */
export function ShortsCategoryChips({ source, onPick }) {
  const active = categoryIdForSource(source);
  return (
    <div className="hb-shorts-chips" role="listbox" aria-label="Shorts category" data-testid="shorts-chips">
      {SHORTS_CATEGORIES.map((cat) => (
        <button
          key={cat.id}
          type="button"
          role="option"
          className="hb-shorts-chip"
          aria-selected={active === cat.id}
          data-category={cat.id}
          onClick={() => onPick(sourceFromCategoryId(cat.id))}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}
