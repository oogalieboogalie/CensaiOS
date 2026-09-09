import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './windows/WindowTitle.jsx';
import { getWindowIntegration } from '../lib/windowManifest.js';
import { api } from '../lib/api.js';
import {
  CONNECTION_STATES,
  DANGER_LEVELS,
  getStatusLabel,
  requiresAuth,
} from '../lib/windowIntegrationTypes.js';

// Reference implementation of the Window Integration Contract.
//
// This component contains ZERO provider-specific logic. Everything it renders -
// the provider name, the auth affordance, the capability chips, the danger
// badge, the permission list, the status wording - is derived from the
// `integration` block declared on the window's manifest. Point a second manifest
// at this same component with different metadata and you get a different
// provider window for free. That is the whole point of the contract.

const DANGER_TONE = {
  [DANGER_LEVELS.SAFE]: 'var(--ps-green)',
  [DANGER_LEVELS.LOW]: 'var(--accent)',
  [DANGER_LEVELS.ELEVATED]: 'var(--ps-blue)',
  [DANGER_LEVELS.HIGH]: 'var(--ps-red)',
  [DANGER_LEVELS.CRITICAL]: 'var(--ps-red)',
};

function Pill({ children, tone = 'var(--ink-soft)', filled = false }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 8px',
      borderRadius: 999,
      fontSize: 10,
      fontWeight: 700,
      fontFamily: 'var(--font-mono)',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      color: filled ? 'white' : tone,
      background: filled ? tone : `color-mix(in oklch, ${tone} 14%, transparent)`,
      border: `1px solid color-mix(in oklch, ${tone} 40%, transparent)`,
    }}>
      {children}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </span>
      {children}
    </div>
  );
}

export function ProviderConnectWindow({ win, onUpdate }) {
  const integration = getWindowIntegration(win.kind || win.type);

  // Status is the only state we persist back to the window; never the secret.
  const [status, setStatus] = React.useState(win.connection?.status || CONNECTION_STATES.DISCONNECTED);
  const [detail, setDetail] = React.useState(win.connection?.detail || null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  // On open, sync the real connection state from the server provider registry
  // (server/providers/registry.js). No secret ever crosses this boundary.
  const providerId = integration?.provider?.id;
  React.useEffect(() => {
    if (!providerId) return undefined;
    let cancelled = false;
    api.getProviderStatus(providerId)
      .then((r) => { if (!cancelled) { setStatus(r.state); setDetail(r.detail || null); } })
      .catch(() => { /* no server adapter / offline — keep the persisted/default state */ });
    return () => { cancelled = true; };
  }, [providerId]);

  if (!integration) {
    return (
      <>
        <WindowTitle icon={<Icon.Plug size={14} />} label={win.title || 'Provider Connect'} subtitle="no integration metadata" />
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24, color: 'var(--ps-red)', fontSize: 12, textAlign: 'center', background: 'var(--surface)' }}>
          This window kind declares no `integration` metadata in its manifest.
        </div>
      </>
    );
  }

  const { provider, authMode, embedMode, dangerLevel, capabilities, defaultPermissions } = integration;
  const needsAuth = requiresAuth(integration);
  const dangerTone = DANGER_TONE[dangerLevel] || 'var(--ink-soft)';

  // Run a real connection test against the server provider registry and persist
  // the resolved state (never a secret) back to the window.
  const runTest = async () => {
    setError(null);
    setBusy(true);
    setStatus(CONNECTION_STATES.CONNECTING);
    try {
      const r = await api.testProvider(provider.id);
      setStatus(r.state);
      setDetail(r.detail || null);
      onUpdate?.({ connection: { status: r.state, detail: r.detail || null, at: new Date().toISOString() } });
      if (r.state === CONNECTION_STATES.ERROR) setError(r.detail || 'Connection test failed.');
    } catch (e) {
      setStatus(CONNECTION_STATES.ERROR);
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const isConnected = status === CONNECTION_STATES.CONNECTED;
  const isBusy = busy || status === CONNECTION_STATES.CONNECTING;
  const statusTone = isConnected ? 'var(--ps-green)' : status === CONNECTION_STATES.ERROR ? 'var(--ps-red)' : 'var(--ink-soft)';

  return (
    <>
      <WindowTitle
        accent={dangerTone}
        icon={<Icon.Plug size={14} />}
        label={win.title || provider.name}
        subtitle={getStatusLabel(integration, status)}
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate?.({ attachedAgents: (win.attachedAgents || []).filter((a) => a !== id) })}
      />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 14, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-ui)' }}>

        {/* Provider header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--surface-2)', border: '1px solid var(--hairline)', color: dangerTone }}>
            <Icon.Plug size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.1 }}>{provider.name}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>
              {provider.id}{provider.category ? ` / ${provider.category}` : ''}
            </div>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: statusTone }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusTone, boxShadow: isConnected ? `0 0 6px ${statusTone}` : 'none' }} />
            {getStatusLabel(integration, status)}
          </span>
        </div>

        {/* Contract metadata, rendered straight from the manifest */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 12, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
          <Field label="Auth mode"><Pill tone="var(--accent)">{authMode}</Pill></Field>
          <Field label="Embed mode"><Pill tone="var(--ink-soft)">{embedMode}</Pill></Field>
          <Field label="Danger level"><Pill tone={dangerTone} filled>{dangerLevel}</Pill></Field>
          <Field label="Permissions">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {defaultPermissions.length
                ? defaultPermissions.map((p) => <Pill key={p} tone="var(--ink-soft)">{p}</Pill>)
                : <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>none</span>}
            </div>
          </Field>
        </div>

        {/* Capabilities */}
        <Field label="Capabilities">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {capabilities.length
              ? capabilities.map((c) => <Pill key={c} tone="var(--ps-blue)">{c}</Pill>)
              : <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>none declared</span>}
          </div>
        </Field>

        {/* Connection detail from the server registry (e.g. "authenticated as octocat"). */}
        {detail && (
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', lineHeight: 1.5, fontFamily: 'var(--font-mono)' }}>
            {detail}
          </div>
        )}
        {!isConnected && needsAuth && (
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
            Credential is read from server configuration ({authMode} auth). Interactive key entry / OAuth
            lands with the per-tenant token store. Use <strong>Test connection</strong> to verify the server is configured.
          </div>
        )}

        {error && <div style={{ color: 'var(--ps-red)', fontSize: 12, lineHeight: 1.4 }}>{error}</div>}

        {/* Actions — a real connection test against the server provider registry. */}
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={runTest} disabled={isBusy} style={{ all: 'unset', cursor: isBusy ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 34, padding: '0 14px', borderRadius: 8, background: isBusy ? 'var(--accent-soft)' : 'var(--accent)', color: isBusy ? 'var(--accent-ink)' : 'white', fontSize: 12, fontWeight: 800, boxShadow: 'var(--shadow-card)', opacity: isBusy ? 0.85 : 1 }}>
            <Icon.Plug size={13} /> {isBusy ? 'Testing...' : (isConnected ? 'Re-test connection' : 'Test connection')}
          </button>
          {provider.docsUrl && (
            <a href={provider.docsUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon.Eye size={12} /> Docs
            </a>
          )}
        </div>
      </div>
    </>
  );
}
