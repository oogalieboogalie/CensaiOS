import React from 'react';
import { Icon } from '../../Icons.jsx';
import {
  FINDER_FAVORITES,
  FINDER_LOCATIONS,
  FINDER_NAV,
  FINDER_TAGS,
} from './data.js';

function NavIcon({ name }) {
  if (name === 'group') return <Icon.Group size={13} />;
  if (name === 'clock') return <Icon.Calendar size={13} />;
  return <Icon.Folder size={13} />;
}

export function FinderSidebar({ selectedNav, onSelectNav }) {
  return (
    <aside className="hb-finder-sidebar" aria-label="Finder sidebar">
      <ul className="hb-finder-nav">
        {FINDER_NAV.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="hb-finder-nav-item"
              data-active={selectedNav === item.id ? 'true' : 'false'}
              onClick={() => onSelectNav?.(item.id)}
            >
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="hb-finder-section">
        <div className="hb-finder-section-label">Favorites</div>
        <ul>
          {FINDER_FAVORITES.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="hb-finder-nav-item"
                data-active={selectedNav === item.id ? 'true' : 'false'}
                onClick={() => onSelectNav?.(item.id)}
              >
                <Icon.Folder size={13} />
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="hb-finder-section">
        <div className="hb-finder-section-label">Locations</div>
        <ul>
          {FINDER_LOCATIONS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="hb-finder-nav-item"
                data-active={selectedNav === item.id ? 'true' : 'false'}
                onClick={() => onSelectNav?.(item.id)}
              >
                <Icon.Monitor size={13} />
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="hb-finder-section">
        <div className="hb-finder-section-label">Tags</div>
        <ul>
          {FINDER_TAGS.map((tag) => (
            <li key={tag.id}>
              <button type="button" className="hb-finder-tag">
                <span className="hb-finder-tag-dot" data-tone={tag.tone} aria-hidden="true" />
                <span>{tag.label}</span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="hb-finder-tag hb-finder-tag-all">
              <Icon.List size={12} />
              <span>All Tags…</span>
            </button>
          </li>
        </ul>
      </div>
    </aside>
  );
}
