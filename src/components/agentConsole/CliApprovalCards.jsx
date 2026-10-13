/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { CliMark } from './CliMark.jsx';
import { InlineDiff } from './Transcript.jsx';
import { cliAgentsApi } from './cliAgentsApi.js';
import { refreshCliRoster } from './useCliRoster.js';
import './agentConsole.css';

// Coding-agent permission requests inside Action Approvals: the same
// allow / deny the Agent Console shows, for whoever is watching approvals.
export function CliApprovalCards({ active = true }) {
  const [items, setItems] = React.useState([]);
  const [unavailable, setUnavailable] = React.useState(false);
  const [busyId, setBusyId] = React.useState(null);
  const [error, setError] = React.useState(null);

  const load = React.useCallback(async () => {
    try {
      const data = await cliAgentsApi.permissions();
      setItems(data.permissions || []);
    } catch (err) {
      if ([401, 403, 404].includes(err.status)) setUnavailable(true);
    }
  }, []);

  React.useEffect(() => {
    if (unavailable) return undefined;
    load();
    if (!active) return undefined;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load, active, unavailable]);

  const decide = async (p, allow) => {
    setBusyId(p.id);
    setError(null);
    try {
      await cliAgentsApi.decide(p.taskId, p.id, allow);
      refreshCliRoster();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
      load();
    }
  };

  if (unavailable || items.length === 0) return null;
  return (
    <section data-testid="cli-approvals" style={{ display: 'grid', gap: 8 }}>
      <div className="ac-label">Coding agents</div>
      {error && <div className="ac-error" role="alert"><Icon.Alert size={13} />{error}</div>}
      {items.map((p) => (
        <article key={p.id} className="ac-step ac-step--pending">
          <header className="ac-step-head">
            <CliMark cli={p.cli} size="sm" />
            <span className="ac-step-title">{p.cliLabel}: {p.title}</span>
            <span className="ac-step-path ac-step-path--plain">{p.taskTitle}</span>
          </header>
          {p.detail && <pre className="ac-block-out" style={{ paddingLeft: 10 }}>{p.detail}</pre>}
          {p.diff && <InlineDiff diff={p.diff} maxLines={12} />}
          <div className="ac-perm">
            <Icon.Shield size={13} />
            <span className="ac-perm-text">Allow this once?</span>
            <button type="button" className="ac-btn" disabled={busyId === p.id} onClick={() => decide(p, false)}>Deny</button>
            <button type="button" className="ac-btn ac-btn--primary" disabled={busyId === p.id} onClick={() => decide(p, true)}>Allow once</button>
          </div>
        </article>
      ))}
    </section>
  );
}
