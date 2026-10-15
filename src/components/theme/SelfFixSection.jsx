/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { ThemePanelCard } from './ThemeControls.jsx';
import { selfFixApi, STATUS_WORDS } from '../../lib/selfFix/api.js';

const muted = { fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', margin: 0, lineHeight: 1.5 };
const row = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const smallButton = { padding: '3px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--hairline)',
  background: 'var(--surface)', color: 'var(--ink)', font: 'inherit', fontSize: 'var(--text-xs)', cursor: 'pointer' };
const STATUS_COLOR = { ready: 'var(--success)', applied: 'var(--success)', landed: 'var(--success)', fixing: 'var(--accent)', failed: 'var(--danger)' };

function when(ms) {
  return ms ? new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
}

function Report({ report, busy, onFix, onUndo }) {
  const canUndo = ['ready', 'applied'].includes(report.status);
  const canFix = ['saved', 'failed', 'undone'].includes(report.status);
  return (
    <div style={{ display: 'grid', gap: 4, padding: '10px 0', borderTop: '1px solid var(--hairline)' }} data-testid="self-fix-report" data-status={report.status}>
      <div style={{ ...row, justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 'var(--text-sm)' }}>{report.title}</strong>
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 650, color: STATUS_COLOR[report.status] || 'var(--ink-soft)' }}>
          {STATUS_WORDS[report.status] || report.status}
        </span>
      </div>
      {report.fix?.summary && <p style={{ ...muted, color: 'var(--ink-soft)' }}>{report.fix.summary}</p>}
      {report.note && <p style={muted}>{report.note}</p>}
      <p style={muted}>
        Seen {report.count} {report.count === 1 ? 'time' : 'times'}, last {when(report.lastSeen)}
        {report.fix?.files?.length ? ` · changed ${report.fix.files.join(', ')}` : ''}
        {report.fix?.verify?.tests ? ` · ${report.fix.verify.tests} tests passed` : ''}
      </p>
      <div style={row}>
        {canUndo && <button type="button" style={smallButton} disabled={busy} onClick={() => onUndo(report.id)}>Undo this fix</button>}
        {canFix && <button type="button" style={smallButton} disabled={busy} onClick={() => onFix(report.id)}>Try to fix it</button>}
      </div>
    </div>
  );
}

/** Settings > Agents: the self-fix switch and every error report with its receipt. */
export function SelfFixSection() {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => selfFixApi.load().then(setData).catch((err) => {
    setError(err.status === 403 ? 'Only this computer\'s owner sees error reports.' : err.message);
  }), []);
  React.useEffect(() => {
    load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [load]);

  const act = async (fn) => {
    setBusy(true);
    setError('');
    try { await fn(); await load(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const state = data?.state;
  const reports = data?.reports || [];
  return (
    <ThemePanelCard style={{ padding: 14, display: 'grid', gap: 8 }} data-testid="self-fix-section">
      <div style={{ fontWeight: 650 }}>Fix errors by itself</div>
      <label style={{ ...row, cursor: state ? 'pointer' : 'default', fontWeight: 600 }}>
        <input type="checkbox" role="switch" aria-label="Fix errors by itself" checked={state?.setting === true}
          disabled={!state || busy} onChange={(e) => act(() => selfFixApi.settings({ autoFix: e.target.checked }))} />
        {state?.on ? 'On' : 'Off'}
      </label>
      <p style={muted}>
        When something breaks, censaiOS saves a report with the error and the log lines around it (keys, emails and file
        contents are taken out). With this on, Claude Code on this computer fixes it in a separate copy, the fix is tested,
        and it goes in the next time censaiOS starts. Reports stay on this computer and only go to your own Claude Code.
        Every fix can be undone here.
      </p>
      {state?.why && <p style={{ ...muted, color: 'var(--ink-soft)' }}>{state.why}</p>}
      {state && <p style={muted}>Fixes today: {state.runsToday} of {state.dailyCap}.</p>}
      {error && <p role="alert" style={{ ...muted, color: 'var(--danger)' }}>{error}</p>}
      {reports.length === 0 && state && <p style={muted}>No errors yet.</p>}
      {reports.map((report) => (
        <Report key={report.id} report={report} busy={busy}
          onFix={(id) => act(() => selfFixApi.fix(id))} onUndo={(id) => act(() => selfFixApi.undo(id))} />
      ))}
    </ThemePanelCard>
  );
}
