/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';

// The board's blueprints, plus the ready-made ones it does not have yet
// (src/lib/blueprints/readyBlueprints.js), each added in one click. The
// window passes none while a blueprint is being written, so adding one
// never closes an unsaved editor.
export function BlueprintList({ blueprints, selectedId, onSelect, onNew, searching, ready = [], onAddReady, busy }) {
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
      {!searching && ready.length > 0 && (
        <section className="hb-bp-ready" aria-label="Ready-made blueprints">
          <span className="hb-bp-ready-label">Ready-made</span>
          {ready.map((b) => (
            <div key={b.key} className="hb-bp-ready-item">
              <span className="hb-bp-item-name">{b.title}</span>
              <span className="hb-bp-item-meta">{b.purpose}</span>
              <button type="button" className="hb-bp-btn" onClick={() => onAddReady(b)} disabled={busy}><Icon.Plus size={12} /> Add to this board</button>
            </div>
          ))}
        </section>
      )}
    </aside>
  );
}
