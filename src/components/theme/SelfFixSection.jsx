import React from 'react';
import { selfFixApi, STATUS_WORDS } from '../../lib/selfFix/api.js';
import { SettingsButton, SettingsGroup, SettingsNote, SettingsSection, SwitchRow } from './settingsKit.jsx';

function when(ms) {
  return ms ? new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
}

function Report({ report, busy, onFix, onUndo }) {
  const canUndo = ['ready', 'applied'].includes(report.status);
  const canFix = ['saved', 'failed', 'undone'].includes(report.status);
  return (
    <li className="hb-set-item" data-testid="self-fix-report" data-status={report.status}>
      <div className="hb-set-item-main">
        <span className="hb-set-label">{report.title}</span>
        <span className={report.status === 'failed' ? 'hb-set-note hb-set-note--warn' : 'hb-set-note'}>{STATUS_WORDS[report.status] || report.status}</span>
        {report.fix?.summary ? <span className="hb-set-hint">{report.fix.summary}</span> : null}
        {report.note ? <span className="hb-set-hint">{report.note}</span> : null}
        <span className="hb-set-hint">
          Seen {report.count} {report.count === 1 ? 'time' : 'times'}, last {when(report.lastSeen)}
          {report.fix?.files?.length ? ` · changed ${report.fix.files.join(', ')}` : ''}
          {report.fix?.verify?.tests ? ` · ${report.fix.verify.tests} tests passed` : ''}
        </span>
      </div>
      {canUndo && <SettingsButton small disabled={busy} onClick={() => onUndo(report.id)}>Undo this fix</SettingsButton>}
      {canFix && <SettingsButton small disabled={busy} onClick={() => onFix(report.id)}>Try to fix it</SettingsButton>}
    </li>
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
    <SettingsSection
      title="Fix errors by itself"
      hint="When something breaks, censaiOS keeps a report with the error and the log lines around it (keys, emails and file contents are taken out). Reports stay on this computer."
      data-testid="self-fix-section"
    >
      <SwitchRow
        label="Let Claude Code fix errors"
        hint="Claude Code on this computer fixes the error in a separate copy, the fix is tested, and it goes in the next time censaiOS starts. Every fix can be undone here."
        switchLabel="Fix errors by itself"
        checked={state?.setting === true}
        disabled={!state || busy}
        onChange={(on) => act(() => selfFixApi.settings({ autoFix: on }))}
      />
      {state?.why ? <SettingsNote>{state.why}</SettingsNote> : null}
      <SettingsNote tone="error">{error}</SettingsNote>
      {state && (
        <SettingsGroup title="Error reports" hint={`Fixes today: ${state.runsToday} of ${state.dailyCap}.`}>
          {reports.length === 0 ? <SettingsNote>No errors yet.</SettingsNote> : (
            <ul className="hb-set-list">
              {reports.map((report) => (
                <Report key={report.id} report={report} busy={busy}
                  onFix={(id) => act(() => selfFixApi.fix(id))} onUndo={(id) => act(() => selfFixApi.undo(id))} />
              ))}
            </ul>
          )}
        </SettingsGroup>
      )}
    </SettingsSection>
  );
}
