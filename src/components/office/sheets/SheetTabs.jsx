/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';

/** Sheet tabs along the bottom: switch, add, rename (double-click), remove. */
export function SheetTabs({ book, activeId, onPick, sheets }) {
  const [renaming, setRenaming] = React.useState(null);
  return (
    <div className="hb-of-tabs" role="tablist" aria-label="Sheets">
      {book.sheets.map((s) => (renaming === s.id ? (
        <input key={s.id} className="hb-of-tabinput" autoFocus defaultValue={s.name} aria-label="Sheet name"
          onBlur={(e) => { sheets.rename(s.id, e.target.value); setRenaming(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); e.stopPropagation(); }} />
      ) : (
        <span key={s.id} className="hb-of-tab" data-active={s.id === activeId ? 'true' : undefined}>
          <button type="button" role="tab" aria-selected={s.id === activeId} onClick={() => onPick(s.id)}
            onDoubleClick={() => setRenaming(s.id)} title="Double-click to rename">{s.name}</button>
          {s.id === activeId && book.sheets.length > 1 && (
            <button type="button" className="hb-of-mini" aria-label={`Remove ${s.name}`} title="Remove sheet"
              onClick={() => sheets.remove(s.id)}><Icon.Close size={8} /></button>
          )}
        </span>
      )))}
      <button type="button" className="hb-of-mini" aria-label="Add a sheet" title="Add a sheet" onClick={sheets.add}><Icon.Plus size={10} /></button>
    </div>
  );
}
