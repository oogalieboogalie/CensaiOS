/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';

export function BlueprintList({ blueprints, selectedId, onSelect, onNew, searching }) {
  return (
    <aside className="hb-bp-list">
      <button type="button" className="hb-bp-btn hb-bp-btn-primary" onClick={onNew}><Icon.Plus size={12} /> New blueprint</button>
      {!blueprints.length && <p className="hb-bp-sub">{searching ? 'Nothing on the shelf matches that.' : 'Nothing on this shelf yet.'}</p>}
      {blueprints.map((b) => (
        <button key={b.id} type="button" className="hb-bp-item" aria-current={b.id === selectedId} onClick={() => onSelect(b.id)}>
          <span className="hb-bp-item-name">{b.title}</span>
          <span className="hb-bp-id">{b.id}</span>
          <span className="hb-bp-item-meta">{b.shelf} · {b.shelfName}{b.type ? ` · ${b.type}` : ''}</span>
        </button>
      ))}
    </aside>
  );
}
