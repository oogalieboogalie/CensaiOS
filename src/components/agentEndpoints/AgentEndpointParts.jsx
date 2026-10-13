/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { setupSnippets, tunnelSteps } from '../../lib/agentEndpoints/snippets.js';

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function CopyBlock({ text, label = 'Copy', testId, multiline = false }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="hb-aep-copy" data-multiline={multiline ? 'true' : undefined}>
      <pre className="hb-aep-code" data-testid={testId}>{text}</pre>
      <button type="button" className="hb-aep-btn" data-variant="quiet"
        onClick={async () => { if (await copyText(text)) { setCopied(true); setTimeout(() => setCopied(false), 1400); } }}>
        {copied ? 'Copied' : label}
      </button>
    </div>
  );
}

export function Switch({ on, onChange, disabled, label, testId }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      className="hb-aep-switch" data-on={on ? 'true' : 'false'} data-testid={testId} onClick={() => onChange(!on)}>
      <span className="hb-aep-switch-knob" />
    </button>
  );
}

function when(value) {
  if (!value) return 'never';
  const d = new Date(value);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString();
}

export function KeyList({ keys, onRevoke, busy }) {
  const live = keys.filter((k) => !k.revokedAt);
  const revoked = keys.filter((k) => k.revokedAt);
  if (!keys.length) return <div className="hb-aep-empty">No keys yet. Make one for each app you connect.</div>;
  return (
    <ul className="hb-aep-list" data-testid="aep-keys">
      {[...live, ...revoked].map((k) => (
        <li key={k.id} className="hb-aep-row" data-revoked={k.revokedAt ? 'true' : undefined} data-testid="aep-key">
          <span className="hb-aep-row-main">{k.label}</span>
          <span className="hb-aep-row-meta">…{k.hint} · used {when(k.lastUsedAt)}</span>
          {k.revokedAt
            ? <span className="hb-aep-tag">Revoked</span>
            : <button type="button" className="hb-aep-btn" data-variant="quiet" disabled={busy}
              data-testid="aep-revoke" onClick={() => onRevoke(k)}>Revoke</button>}
        </li>
      ))}
    </ul>
  );
}

export function CallLog({ calls }) {
  if (!calls.length) return <div className="hb-aep-empty">No outside calls yet.</div>;
  return (
    <ul className="hb-aep-list" data-testid="aep-calls">
      {calls.map((c) => (
        <li key={c.id} className="hb-aep-row" data-testid="aep-call">
          <span className="hb-aep-dot" data-status={c.status} aria-label={c.status} />
          <span className="hb-aep-row-main">{c.question || '(empty)'}</span>
          <span className="hb-aep-row-meta">
            {c.via === 'mcp' ? 'MCP' : 'HTTP'}{c.keyLabel ? ` · ${c.keyLabel}` : ''} · {c.status === 'ok' ? `${(c.durationMs / 1000).toFixed(1)} s` : c.status} · {when(c.at)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ConnectTabs({ base, endpoint, freshKey, relayAddress = null }) {
  const snippets = setupSnippets({ base, endpoint, key: freshKey, relayAddress });
  const [tab, setTab] = React.useState(snippets[0].id);
  const current = snippets.find((s) => s.id === tab) || snippets[0];
  return (
    <div className="hb-aep-connect">
      <div className="hb-aep-tabs" role="tablist">
        {snippets.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={s.id === tab} className="hb-aep-tab"
            data-testid={`aep-tab-${s.id}`} onClick={() => setTab(s.id)}>{s.label}</button>
        ))}
      </div>
      <div className="hb-aep-hint">{current.hint}</div>
      <CopyBlock text={current.text} testId={`aep-snippet-${current.id}`} multiline />
    </div>
  );
}

export function ReachOutside({ outsidePort, outsideBase, setOutsideBase }) {
  const [open, setOpen] = React.useState(false);
  if (!open) {
    return (
      <button type="button" className="hb-aep-btn" data-testid="aep-reach" onClick={() => setOpen(true)}>
        Make reachable from outside
      </button>
    );
  }
  return (
    <div className="hb-aep-reach" data-testid="aep-reach-guide">
      <p className="hb-aep-hint">
        Apps on this computer can use the address above as it is. For apps on other computers,
        open a free Cloudflare Tunnel on this computer, then paste the https address it prints below.
        The tunnel only reaches your shared agents, never the rest of censaiOS, and the agent key still guards every call.
      </p>
      {!outsidePort && <p className="hb-aep-hint" data-testid="aep-outside-off">The outside port is not open on this install, so a tunnel has nothing to reach yet.</p>}
      {tunnelSteps(outsidePort).map((step) => (
        <div key={step.id} className="hb-aep-step">
          <div className="hb-aep-step-label">{step.label}</div>
          <CopyBlock text={step.text} />
        </div>
      ))}
      <label className="hb-aep-step-label" htmlFor="aep-outside-base">Outside address</label>
      <input id="aep-outside-base" className="hb-aep-input" placeholder="https://something.trycloudflare.com"
        value={outsideBase} onChange={(e) => setOutsideBase(e.target.value)} data-testid="aep-outside-base" />
    </div>
  );
}

/** The relay form of the address: reachable even while this computer is off. */
export function RelayAddress({ address, relay }) {
  if (!address) return null;
  return (
    <div className="hb-aep-step" data-testid="aep-relay">
      <div className="hb-aep-step-label">Always-on address (through the relay)</div>
      <CopyBlock text={address} testId="aep-relay-url" />
      <div className="hb-aep-hint" data-testid="aep-relay-state">
        {relay?.connected ? 'Connected to the relay.' : 'Connecting to the relay…'} If this computer is off,
        questions sent here wait in line and are answered when censaiOS opens again.
      </div>
    </div>
  );
}
