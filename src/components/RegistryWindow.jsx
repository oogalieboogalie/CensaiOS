// src/components/RegistryWindow.jsx
//
// D4 of the marketplace/registry push, plus the effective Tools trust surface:
//   Browse     — paginated REST list of cards. Install button per row.
//   Installed  — durable workspace-scoped pins. Call / Remove pin.
//   Publish    — form to create a new card via REST.
//   Activity   — live WS feed of events for the installed cards.
//   Tools      — exact signed family baseline and reviewed module availability.
//
// Transport: a single facade (src/lib/agentRegistry/client.js) wraps D2
// (REST) + D3 (WS) + durable install routes. Tests inject a mock client
// via the `client` prop. Each tab is a separate file in ./registry/.

import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './windows/WindowTitle.jsx';
import { createRegistryClient } from '../lib/agentRegistry/client.js';
import { BrowseTab } from './registry/BrowseTab.jsx';
import { InstalledTab } from './registry/InstalledTab.jsx';
import { PublishTab } from './registry/PublishTab.jsx';
import { ActivityTab } from './registry/ActivityTab.jsx';
import { useWorkspaceStore } from '../lib/store.js';
import { useRegistryInstalls } from './registry/useRegistryInstalls.js';
import { ToolCatalogTab } from './registry/ToolCatalogTab.jsx';
import { ToolPackagesTab } from './registry/ToolPackagesTab.jsx';
import { useToolPackages } from './registry/useToolPackages.js';

const TABS = [
  { id: 'browse',    label: 'Browse',    icon: 'Search'  },
  { id: 'installed', label: 'Installed', icon: 'Plug'    },
  { id: 'publish',   label: 'Publish',   icon: 'Plus'    },
  { id: 'activity',  label: 'Activity',  icon: 'History' },
  { id: 'tools',     label: 'Tools',     icon: 'Tools'   },
  { id: 'packages',  label: 'Add-ons',   icon: 'Package' },
];

function TabBar({ active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid var(--hairline)', background: 'var(--surface-2)', flexShrink: 0, overflowX: 'auto' }}>
      {TABS.map((t) => {
        const Glyph = Icon[t.icon];
        return (
          <button
            key={t.id}
            type="button"
            data-testid={`registry-tab-${t.id}`}
            onClick={() => onChange(t.id)}
            style={{
              all: 'unset', cursor: 'pointer', padding: '6px 12px', borderRadius: 7,
              fontSize: 12, fontWeight: 650, display: 'inline-flex', alignItems: 'center', gap: 6,
              color: active === t.id ? 'var(--accent-ink)' : 'var(--ink-soft)',
              background: active === t.id ? 'var(--accent-soft)' : 'transparent',
            }}
          >
            {Glyph ? <Glyph size={13} /> : null}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function RegistryWindow({ win, onUpdate, client: clientProp }) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const hasWorkspaceScope = Boolean(workspaceId) || Boolean(clientProp);
  const client = React.useMemo(
    () => clientProp || createRegistryClient({ workspaceId: workspaceId || null }),
    [clientProp, workspaceId]
  );
  const [activeTab, setActiveTab] = React.useState('browse');
  const [activity, setActivity] = React.useState([]);
  const [error, setError] = React.useState('');
  const subsRef = React.useRef(new Set());
  const callsRef = React.useRef(new Set());
  const installs = useRegistryInstalls(client, hasWorkspaceScope);
  const packages = useToolPackages(client, hasWorkspaceScope);
  const installed = installs.installed;

  React.useEffect(() => {
    if (installs.ready && onUpdate) onUpdate({ installedSnapshot: Object.keys(installed) });
  }, [installed, installs.ready, onUpdate]);

  // Subscribe to installed cards' WS events. One subscription per card;
  // teardown on unmount or when the installed set changes.
  React.useEffect(() => {
    const offs = [];
    for (const cardId of Object.keys(installed)) {
      try {
        const off = client.subscribeToCard(cardId, (event) => {
          setActivity((prev) => [...prev, { ...event, cardId, ts: new Date().toISOString() }].slice(-200));
        });
        offs.push(off);
        subsRef.current.add(off);
      } catch (err) {
        setError(`subscribe failed for ${cardId}: ${err.message}`);
      }
    }
    return () => {
      for (const off of offs) { try { off(); } catch { /* noop */ } }
    };
  }, [client, installed]);

  React.useEffect(() => () => {
    for (const off of subsRef.current) { try { off(); } catch { /* noop */ } }
    subsRef.current.clear();
    for (const iter of callsRef.current) { try { iter.return?.(); } catch { /* noop */ } }
    callsRef.current.clear();
    try { client.closeSocket?.(); } catch { /* noop */ }
  }, [client]);

  const handleCall = (cardId) => {
    if (!hasWorkspaceScope) {
      setError('Open a workspace before calling an AgentCard.');
      return;
    }
    (async () => {
      let iter;
      try {
        iter = client.callCard(cardId, { message: 'hello from registry window' });
        callsRef.current.add(iter);
        for await (const event of iter) {
          setActivity((prev) => [...prev, { ...event, cardId, ts: new Date().toISOString() }].slice(-200));
        }
      } catch (err) {
        setError(`call failed for ${cardId}: ${err.message}`);
      } finally {
        if (iter) callsRef.current.delete(iter);
      }
    })();
  };

  const handlePublished = async (card) => {
    if (!card) return;
    if (!await installs.install(card.id)) throw new Error('Card published, but its workspace pin was not saved.');
    setActiveTab('installed');
  };

  return (
    <>
      <WindowTitle
        icon={<Icon.Plug size={14} />}
        label={win?.title || 'Agent Registry'}
        subtitle="browse · durable workspace pins · call activity"
      />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface)', overflow: 'hidden' }}>
        <TabBar active={activeTab} onChange={setActiveTab} />
        {!hasWorkspaceScope && (
          <div role="status" style={{ color: 'var(--ink-soft)', fontSize: 12, padding: '7px 12px', borderBottom: '1px solid var(--hairline)', background: 'var(--surface-raised)' }}>
            Open a workspace to pin, publish, or call AgentCards. Public team cards remain browsable.
          </div>
        )}
        {(error || installs.error || packages.error) && <div data-testid="registry-error-banner" style={{ color: 'var(--ps-red)', fontSize: 12, padding: '6px 12px', borderBottom: '1px solid var(--hairline)' }}>{error || installs.error || packages.error}</div>}
        {activeTab === 'browse' && <BrowseTab client={client} installed={installed}
          onInstall={installs.install} busyIds={installs.busyIds}
          canInstall={hasWorkspaceScope && installs.ready && installs.canManage} />}
        {activeTab === 'installed' && !installs.ready && <div role="status" style={{ padding: 18, color: 'var(--ink-soft)' }}>Loading workspace AgentCards…</div>}
        {activeTab === 'installed' && installs.ready && <InstalledTab installed={installed}
          onUninstall={installs.uninstall} busyIds={installs.busyIds} canManage={installs.canManage}
          onCall={handleCall} canCall={hasWorkspaceScope} />}
        {activeTab === 'publish'   && <PublishTab client={client} onPublished={handlePublished}
          canPublish={hasWorkspaceScope} canImport={hasWorkspaceScope && installs.ready && installs.canManage} />}
        {activeTab === 'activity'  && <ActivityTab  events={activity} />}
        {activeTab === 'tools' && hasWorkspaceScope && <ToolCatalogTab client={client} />}
        {activeTab === 'tools' && !hasWorkspaceScope && <div role="status" style={{ padding: 18, color: 'var(--ink-soft)' }}>Open a workspace to inspect effective team tools.</div>}
        {activeTab === 'packages' && hasWorkspaceScope && <ToolPackagesTab
          packages={packages.packages} ready={packages.ready} canManage={packages.canManage}
          busyIds={packages.busyIds} onInstall={packages.install} onRemove={packages.remove} />}
        {activeTab === 'packages' && !hasWorkspaceScope && <div role="status" style={{ padding: 18, color: 'var(--ink-soft)' }}>Open a workspace to manage add-ons.</div>}
      </div>
    </>
  );
}

export default RegistryWindow;
