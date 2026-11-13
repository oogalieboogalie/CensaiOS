/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { REDDIT_CATEGORIES, categoryIdForSource, sourceFromCategory } from '../../../lib/reddit/redditFeed.js';

export function RedditChips({ source, onPick }) {
  const active = categoryIdForSource(source);
  return (
    <div className="hb-reddit-chips" role="listbox" aria-label="Reddit category" data-testid="reddit-chips">
      {REDDIT_CATEGORIES.map((cat) => (
        <button
          key={cat.id}
          type="button"
          role="option"
          className="hb-reddit-chip"
          aria-selected={active === cat.id}
          data-category={cat.id}
          onClick={() => onPick(sourceFromCategory(cat))}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}
