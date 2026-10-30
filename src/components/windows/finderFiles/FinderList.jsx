import React from 'react';
import { Icon } from '../../Icons.jsx';
import { isImageFile } from '../../files/fileRouting.js';
import { FINDER_WORDS, formatModified, formatSize } from './finderFormat.js';

// Empty zebra rows keep the list looking like a Finder pane even with a few files.
const MIN_ROWS = 12;
const zebra = (index) => (index % 2 === 1 ? 'odd' : 'even');

function ItemIcon({ item }) {
  if (item.isDir) return <Icon.Folder size={14} />;
  if (isImageFile(item.name)) return <Icon.Picture size={14} />;
  return <Icon.Files size={14} />;
}

/** The folders from the project's top folder down to the one shown; each opens its folder. */
function PathBar({ crumbs, count, onGo }) {
  return (
    <div className="hb-finder-pathbar" aria-label="Path">
      {crumbs.map((crumb, index) => (
        <React.Fragment key={crumb.path}>
          {index > 0 && <span className="hb-finder-crumb-sep" aria-hidden="true">›</span>}
          <button type="button" className="hb-finder-crumb" title={`Open ${crumb.name}`}
            aria-current={index === crumbs.length - 1 ? 'location' : undefined} onClick={() => onGo(crumb.path)}>
            {crumb.name}
          </button>
        </React.Fragment>
      ))}
      {count !== null && <span className="hb-finder-count">{count === 1 ? '1 item' : `${count} items`}</span>}
    </div>
  );
}

/**
 * The folder's files, Finder-style: a click picks one, a double-click (or
 * Enter) opens it. `items` is null while the folder is being listed.
 */
export function FinderList({ title, items, problem, offer, selected, onSelectItem, onOpen, nav, crumbs, onGo }) {
  const now = new Date();
  const rows = items || [];
  const note = items === null ? FINDER_WORDS.loading : problem ? problem.words : rows.length === 0 ? FINDER_WORDS.empty : '';
  const filled = rows.length + (note ? 1 : 0);
  const listRef = React.useRef(null);
  const backRef = React.useRef(null);
  // Enter on a folder swaps every row out, dropping the keyboard's place:
  // pick it up on the new folder's first row (or Back, when it has none).
  const keyedIn = React.useRef(false);
  React.useEffect(() => {
    if (!keyedIn.current || items === null) return;
    keyedIn.current = false;
    // Only while nothing else has the keyboard (the person may have clicked away meanwhile).
    const at = document.activeElement;
    if (at && at !== document.body && at.isConnected) return;
    (listRef.current?.querySelector('[data-testid="finder-row"]') || backRef.current)?.focus();
  }, [items]);

  return (
    <section className="hb-finder-main" aria-label={`${title} files`}>
      <div className="hb-finder-toolbar">
        <div className="hb-finder-toolbar-nav">
          <button type="button" ref={backRef} aria-label="Back" title="Back" disabled={!nav.canBack} onClick={nav.back}>‹</button>
          <button type="button" aria-label="Forward" title="Forward" disabled={!nav.canForward} onClick={nav.forward}>›</button>
        </div>
        <div className="hb-finder-toolbar-title">{title}</div>
      </div>

      <div className="hb-finder-columns" role="row">
        <span>Name</span>
        <span>Date Modified</span>
        <span>Size</span>
      </div>

      <ul className="hb-finder-rows" ref={listRef}>
        {rows.map((item, index) => (
          <li key={item.path}>
            <button
              type="button"
              className="hb-finder-row"
              data-testid="finder-row"
              data-kind={item.isDir ? 'folder' : 'file'}
              data-zebra={zebra(index)}
              data-selected={selected === item.path ? 'true' : 'false'}
              title={item.isDir ? 'Double-click to open this folder' : 'Double-click to open'}
              onClick={() => onSelectItem(item.path)}
              onDoubleClick={() => onOpen(item)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                keyedIn.current = item.isDir;
                onOpen(item);
              }}
            >
              <span className="hb-finder-name">
                <ItemIcon item={item} />
                <span>{item.name}</span>
              </span>
              <span>{formatModified(item.modified, now)}</span>
              {/* Only files come with a size; a folder shows "--", as in Finder. */}
              <span>{formatSize(item.size)}</span>
            </button>
          </li>
        ))}
        {note && (
          <li className="hb-finder-note" data-testid="finder-note" data-problem={problem ? 'true' : 'false'} role="status">
            <span>{note}</span>
            {offer}
          </li>
        )}
        {Array.from({ length: Math.max(0, MIN_ROWS - filled) }, (_, index) => (
          <li key={`fill-${index}`} className="hb-finder-row" data-empty="true" data-zebra={zebra(filled + index)} aria-hidden="true" />
        ))}
      </ul>

      <PathBar crumbs={crumbs} count={items && !problem ? items.length : null} onGo={onGo} />
    </section>
  );
}
