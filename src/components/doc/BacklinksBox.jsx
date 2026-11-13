/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// The Backlinks box beside a note: the notes that link to it with [[name]].
// A note nothing links to yet gets one quiet line saying how links work, once
// censaiOS has looked (only for .md files on this computer, where links work).
import React from 'react';
import { Icon } from '../Icons.jsx';

export function canHaveBacklinks(win) {
  return Boolean(win?.filePath) && !win.isGithub && /\.md$/i.test(String(win.filePath));
}

export function BacklinksBox({ win, backlinks, capped, checked, onSpawn }) {
  if (backlinks.length === 0) {
    if (!checked || !canHaveBacklinks(win)) return null;
    return (
      <div data-testid="backlinks-hint" className="doc-hint">
        Type <code className="hb-code">[[</code> and a note's name to link it. Notes that link to this one show here.
      </div>
    );
  }
  return (
    <div className="doc-backlinks">
      <div className="doc-label">Backlinks</div>
      {capped && <div role="status" className="doc-capped">Showing the first {backlinks.length}.</div>}
      {backlinks.map((bl, i) => (
        <button type="button" key={i} className="hb-panel hb-lift doc-backlink" onClick={() => onSpawn?.('doc', { fileName: bl.name, filePath: bl.path })}>
          <Icon.Files size={10} />
          <span className="doc-backlink-name">{bl.name}</span>
        </button>
      ))}
    </div>
  );
}
