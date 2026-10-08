/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { createPortal } from 'react-dom';

/**
 * A keyboard-first palette (Raycast / Linear style): one search box over
 * sectioned rows. The caller owns the data; `sections` is
 * [{ id, label, items: [{ id, label, hint, icon, onSelect, keepOpen }] }]
 * already filtered for `query`. Arrow keys move, Enter runs, Escape closes.
 */
export function CommandPalette({ open, onClose, query, onQueryChange, sections, placeholder = 'Search', footer, inputRef: externalRef }) {
  const [selected, setSelected] = React.useState(0);
  const localRef = React.useRef(null);
  const inputRef = externalRef || localRef;
  const listRef = React.useRef(null);
  const flat = React.useMemo(() => sections.flatMap(s => s.items), [sections]);

  React.useEffect(() => { setSelected(0); }, [query, open]);
  React.useEffect(() => { if (open) inputRef.current?.focus(); }, [open, inputRef]);
  React.useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);

  if (!open) return null;

  const run = (item) => {
    if (!item) return;
    item.onSelect?.();
    if (!item.keepOpen) onClose();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(i => (flat.length ? (i + 1) % flat.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(i => (flat.length ? (i - 1 + flat.length) % flat.length : 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(flat[selected]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  let index = -1;
  // Portaled: a toolbar ancestor with a transform would otherwise trap the
  // fixed overlay inside it.
  return createPortal((
    <div className="hb-palette-scrim" data-canvas-ui onMouseDown={onClose}>
      <div className="hb-palette" role="dialog" aria-modal="true" aria-label={placeholder} onMouseDown={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="hb-palette-input"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-controls="hb-palette-list"
          spellCheck={false}
        />
        <div className="hb-palette-list" id="hb-palette-list" role="listbox" ref={listRef}>
          {sections.filter(s => s.items.length > 0).map(section => (
            <div key={section.id || section.label} role="group" aria-label={section.label}>
              {section.label && <div className="hb-palette-section">{section.label}</div>}
              {section.items.map((item) => {
                index += 1;
                const i = index;
                return (
                  <div
                    key={item.id}
                    role="option"
                    aria-selected={i === selected}
                    className="hb-palette-row"
                    data-palette-item={item.id}
                    onMouseMove={() => setSelected(i)}
                    onClick={() => run(item)}
                  >
                    <span className="hb-palette-icon" aria-hidden="true">{item.icon}</span>
                    <span className="hb-palette-label">{item.label}</span>
                    {item.hint && <span className="hb-palette-hint">{item.hint}</span>}
                  </div>
                );
              })}
            </div>
          ))}
          {flat.length === 0 && <div className="hb-palette-empty">No matches</div>}
        </div>
        {footer && <div className="hb-palette-footer">{footer}</div>}
      </div>
    </div>
  ), document.body);
}

export default CommandPalette;
