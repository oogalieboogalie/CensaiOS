/**
 * src/components/MarketplaceWindow.jsx
 *
 * Brief B2 — `.team/handoffs/2026-06-23-b2-marketplace-window.md`.
 *
 * The opt-in marketplace: 4 tabs (Windows / Agents / Integrations / Themes),
 * each row is a one-line description + on/off toggle backed by B1's
 * `setWindowAllowed` action. Selection persists via AppContent's existing
 * workspace persist useEffect (windowAllowList field).
 *
 * Pure JSX, no new deps. Reads the catalog from `src/lib/marketplace/registry.js`.
 */

import React from 'react';
import { useWorkspaceStore } from '../lib/store.js';
import { Icon } from './Icons.jsx';
import {
  getMarketplaceCatalogByCategory,
  filterCatalogBySearch,
} from '../lib/marketplace/registry.js';

const TABS = [
  { id: 'window', label: 'Windows', icon: 'Files' },
  { id: 'agent', label: 'Agents', icon: 'Bot' },
  { id: 'integration', label: 'Integrations', icon: 'Plug' },
  { id: 'theme', label: 'Themes', icon: 'Eye' },
];

export function MarketplaceWindow() {
  const windowAllowList = useWorkspaceStore((s) => s.windowAllowList);
  const setWindowAllowed = useWorkspaceStore((s) => s.setWindowAllowed);

  const [activeTab, setActiveTab] = React.useState('window');
  const [search, setSearch] = React.useState('');

  const catalog = React.useMemo(() => getMarketplaceCatalogByCategory(), []);
  const rows = catalog[activeTab] || [];
  const visible = React.useMemo(() => filterCatalogBySearch(rows, search), [rows, search]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, color: 'var(--ink)' }}>
      <div style={{ display: 'flex', gap: 4, padding: '8px 8px 4px', borderBottom: '1px solid var(--hairline)' }}>
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          const Glyph = Icon[tab.icon] || Icon.Folder;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`marketplace-tab-${tab.id}`}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '6px 10px',
                borderRadius: 8,
                background: isActive ? 'var(--surface-2)' : 'transparent',
                color: isActive ? 'var(--ink)' : 'var(--ink-soft)',
                fontWeight: isActive ? 600 : 400,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Glyph size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>
      <div style={{ padding: '8px 8px 4px', borderBottom: '1px solid var(--hairline)' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          data-testid="marketplace-search"
          aria-label="Search marketplace"
          style={{
            width: '100%',
            padding: '6px 10px',
            background: 'var(--surface-2)',
            color: 'var(--ink)',
            border: '1px solid var(--hairline)',
            borderRadius: 8,
            outline: 'none',
          }}
        />
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 4px 8px' }}>
        {visible.length === 0 ? (
          <div style={{ padding: 16, color: 'var(--ink-faint)', textAlign: 'center' }}>
            No items match.
          </div>
        ) : (
          visible.map((row) => {
            const allowed = Boolean(windowAllowList[row.kind]);
            const Glyph = Icon[row.launcherIcon] || Icon.Folder;
            return (
              <div
                key={row.id}
                data-testid={`marketplace-row-${row.kind}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: allowed ? 'var(--surface-2)' : 'transparent',
                  border: '1px solid transparent',
                  marginBottom: 4,
                }}
              >
                <Glyph size={16} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{row.label}</div>
                  <div style={{ color: 'var(--ink-soft)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.description || row.hint}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={allowed}
                  onClick={() => setWindowAllowed(row.kind, !allowed)}
                  data-testid={`marketplace-toggle-${row.kind}`}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    padding: '4px 12px',
                    borderRadius: 999,
                    background: allowed ? 'var(--accent, #6c8cff)' : 'var(--surface)',
                    color: allowed ? 'var(--accent-ink, white)' : 'var(--ink-soft)',
                    border: '1px solid var(--hairline)',
                    minWidth: 56,
                    textAlign: 'center',
                  }}
                >
                  {allowed ? 'On' : 'Off'}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default MarketplaceWindow;