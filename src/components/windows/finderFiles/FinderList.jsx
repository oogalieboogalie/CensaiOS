import React from 'react';
import { Icon } from '../../Icons.jsx';

export function FinderList({
  folderName,
  files,
  selectedId,
  onSelect,
}) {
  // Empty zebra rows keep the list looking like a Finder pane even with one file.
  const rows = [...files];
  while (rows.length < 12) {
    rows.push({ id: `empty-${rows.length}`, empty: true });
  }

  return (
    <section className="hb-finder-main" aria-label={`${folderName} files`}>
      <div className="hb-finder-toolbar">
        <div className="hb-finder-toolbar-nav">
          <button type="button" aria-label="Back">‹</button>
          <button type="button" aria-label="Forward">›</button>
        </div>
        <div className="hb-finder-toolbar-title">{folderName}</div>
        <div className="hb-finder-toolbar-views" aria-label="View options">
          <button type="button" data-active="true" aria-label="List view"><Icon.List size={13} /></button>
          <button type="button" aria-label="Grid view"><Icon.Folder size={13} /></button>
          <button type="button" aria-label="Column view"><Icon.Files size={13} /></button>
          <button type="button" aria-label="Search"><Icon.Search size={13} /></button>
        </div>
      </div>

      <div className="hb-finder-columns" role="row">
        <span>Name</span>
        <span>Date Modified</span>
        <span>Size</span>
      </div>

      <ul className="hb-finder-rows">
        {rows.map((file, index) => (
          <li key={file.id}>
            <button
              type="button"
              className="hb-finder-row"
              data-zebra={index % 2 === 1 ? 'odd' : 'even'}
              data-selected={!file.empty && selectedId === file.id ? 'true' : 'false'}
              data-empty={file.empty ? 'true' : 'false'}
              disabled={file.empty}
              onClick={() => !file.empty && onSelect?.(file.id)}
            >
              <span className="hb-finder-name">
                {!file.empty && <Icon.Files size={14} />}
                <span>{file.empty ? '' : file.name}</span>
              </span>
              <span>{file.empty ? '' : file.modified}</span>
              <span>{file.empty ? '' : file.size}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
