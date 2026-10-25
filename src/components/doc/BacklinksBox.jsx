/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// The Backlinks box beside a note: the notes that link to it with [[name]].
// A note nothing links to yet gets one quiet line saying how links work, once
// censaiOS has looked (only for .md files on this computer, where links work).
import React from 'react';
import { Icon } from '../Icons.jsx';

const labelStyle = { fontFamily: 'var(--font-label)', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', letterSpacing: 'var(--label-tracking)', textTransform: 'var(--label-case)', padding: '0 6px 4px' };

export function canHaveBacklinks(win) {
  return Boolean(win?.filePath) && !win.isGithub && /\.md$/i.test(String(win.filePath));
}

export function BacklinksBox({ win, backlinks, capped, checked, onSpawn }) {
  if (backlinks.length === 0) {
    if (!checked || !canHaveBacklinks(win)) return null;
    return (
      <div data-testid="backlinks-hint" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', padding: '0 6px', marginBottom: 12, lineHeight: 1.5 }}>
        Type <code style={{ fontFamily: 'var(--font-mono)' }}>[[</code> and a note's name to link it. Notes that link to this one show here.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
      <div style={labelStyle}>Backlinks</div>
      {capped && <div role="status" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', padding: '0 6px 4px' }}>Showing the first {backlinks.length}.</div>}
      {backlinks.map((bl, i) => (
        <div key={i}
          onClick={() => onSpawn?.('doc', { fileName: bl.name, filePath: bl.path })}
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '6px 8px', fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-ink)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--hairline)'}
        >
          <Icon.Files size={10} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          {bl.name}
        </div>
      ))}
    </div>
  );
}
