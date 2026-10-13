/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { iconDataUrl } from '../../../lib/dock/castFrame.js';
import { pickerRows } from '../../../lib/dock/wire.js';

function AppIcon({ icon }) {
  const src = React.useMemo(() => iconDataUrl(icon), [icon]);
  if (!src) return <span className="hb-dock-row-icon" aria-hidden="true"><Icon.NewWindow size={16} /></span>;
  return <img className="hb-dock-row-icon" src={src} alt="" width="20" height="20" />;
}

/** The running apps on this computer, to pick one to dock. */
export function DockPicker({ rows, error, refresh, pick, cancel }) {
  const [query, setQuery] = React.useState('');
  const list = React.useMemo(() => pickerRows(rows, query), [rows, query]);
  return (
    <div className="hb-dock-picker" data-testid="dock-picker">
      <div className="hb-dock-picker-head">
        <div className="hb-dock-title">Dock an app</div>
        <p className="hb-dock-body">Pick a running app. It stays a real app on your computer, placed here and moving with this window. Games should run in windowed or borderless mode.</p>
        <div className="hb-dock-picker-tools">
          <input className="hb-dock-search" type="search" placeholder="Filter apps" value={query} aria-label="Filter apps"
            onChange={(e) => setQuery(e.target.value)} data-no-drag />
          <button type="button" className="hb-btn" onClick={refresh} title="Refresh the list"><Icon.Refresh size={14} /></button>
          {cancel && <button type="button" className="hb-btn" onClick={cancel}>Cancel</button>}
        </div>
      </div>
      {error && <p className="hb-dock-error" role="alert">{error}</p>}
      {!error && rows === null && <p className="hb-dock-muted">Looking for apps…</p>}
      {!error && rows !== null && list.length === 0 && <p className="hb-dock-muted">{query ? 'No app matches.' : 'No other apps are open. Start one, then refresh.'}</p>}
      <ul className="hb-dock-list">
        {list.map((row) => (
          <li key={row.id}>
            <button type="button" className="hb-dock-row" onClick={() => pick(row)} data-testid="dock-candidate">
              <AppIcon icon={row.icon} />
              <span className="hb-dock-row-text">
                <span className="hb-dock-row-name">{row.title}</span>
                <span className="hb-dock-row-process">{row.process}</span>
              </span>
              <span className="hb-dock-row-action">Dock</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
