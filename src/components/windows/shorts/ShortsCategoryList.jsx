/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { SHORTS_CATEGORIES, sourceFromCategoryId } from '../../../lib/shorts/shortsCategories.js';
import { sourceKey } from '../../../lib/shorts/shortsFeed.js';

/**
 * Category / type picker for Shorts. Picking one replaces the shared feed
 * with that channel's Shorts shelf.
 */
export function ShortsCategoryList({ source, onPick }) {
  const current = sourceKey(source);
  return (
    <ul className="hb-shorts-cats" data-testid="shorts-categories">
      {SHORTS_CATEGORIES.map((cat) => {
        const next = sourceFromCategoryId(cat.id);
        const active = current === sourceKey(next);
        return (
          <li key={cat.id}>
            <button
              type="button"
              className="hb-shorts-cat"
              data-category={cat.id}
              aria-current={active ? 'true' : undefined}
              onClick={() => onPick(next)}
            >
              <Icon.Shorts size={14} />
              <span className="hb-shorts-cat-label">{cat.label}</span>
              <span className="hb-shorts-cat-hint">{active ? 'Playing' : cat.hint}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
