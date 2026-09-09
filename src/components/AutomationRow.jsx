import { Icon } from './Icons.jsx';
import { WindowTitle } from './windows/WindowTitle.jsx';
import { mapStatus, formatRelativeNextRun, resolveCurrentStep } from '../lib/automationFormat.js';

/**
 * One row of the Automation Board. Receives a pre-fetched entry from the parent
 * (parent owns polling + action wiring) and renders the four required fields:
 *   1. status (queued | running | done | error | unknown)
 *   2. current step / what it is doing
 *   3. location / where it is running
 *   4. next run time (relative)
 *
 * Status badge + card border use theme CSS variables only.
 */
export function AutomationRow({ taskName, info, onAction }) {
  const status = mapStatus(info);
  const currentStep = resolveCurrentStep(info);
  const location = (info && typeof info.host === 'string' && info.host) ? info.host : '—';
  const nextRun = formatRelativeNextRun(info && info.nextRunTime);
  const state = (info && info.state) || 'Unknown';
  const lastRun = info && info.lastRunTime ? formatAbsolute(info.lastRunTime) : 'Never';
  const result = info && info.lastTaskResult !== null && info.lastTaskResult !== undefined
    ? info.lastTaskResult
    : null;
  const armed = !!info && !!info.armed;
  const pending = Number(info && info.pending) || 0;
  const dispatched = Number(info && info.dispatched) || 0;
  const isRunning = status === 'running';
  const isErrored = status === 'error';
  const cardStyle = {
    background: 'var(--surface-2)',
    border: isErrored ? '1px solid var(--ps-red)' : '1px solid var(--hairline)',
    borderRadius: 12,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  };

  return (
    <div
      data-testid="automation-row"
      data-task={taskName}
      data-status={status}
      data-current-step={currentStep}
      data-location={location}
      data-next-run={nextRun}
      style={cardStyle}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusBadge status={status} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{taskName}</span>
          </h3>
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>
            State: <span style={{ color: 'var(--ink)' }}>{state}</span>
            {!armed && ' (Not Armed)'}
          </div>
        </div>
        {armed && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => onAction(taskName, state === 'Disabled' ? 'enable' : 'disable')}
              style={btnStyle(state === 'Disabled' ? 'accent' : 'ghost')}
            >
              {state === 'Disabled' ? 'Resume' : 'Pause'}
            </button>
            <button
              onClick={() => onAction(taskName, 'run')}
              disabled={isRunning}
              style={{ ...btnStyle('ghost'), cursor: isRunning ? 'wait' : 'pointer', opacity: isRunning ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Icon.Play size={12} />
              Run Now
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <Field label="Status">{status}</Field>
        <Field label="Doing">{currentStep}</Field>
        <Field label="Location">{location}</Field>
        <Field label="Next Run">{nextRun}</Field>
        <Field label="Last Run">{lastRun}</Field>
        <Field label="Queue">{`${pending} pending / ${dispatched} dispatched`}</Field>
      </div>

      {result !== null && (
        <div style={{ fontSize: 11, color: result === 0 ? 'var(--ps-green)' : 'var(--ps-red)', fontFamily: 'var(--font-mono)' }}>
          Last result: {result}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const color = statusColor(status);
  return (
    <span
      data-testid="automation-status-badge"
      data-status={status}
      title={status}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 64,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'white',
        background: color,
      }}
    >
      {status}
    </span>
  );
}

function statusColor(status) {
  if (status === 'error') return 'var(--ps-red)';
  if (status === 'running') return 'var(--ps-blue)';
  if (status === 'done') return 'var(--ps-green)';
  if (status === 'queued') return 'var(--accent)';
  return 'var(--ink-faint)';
}

function Field({ label, children }) {
  return (
    <div style={{ background: 'var(--surface)', padding: 10, borderRadius: 8, border: '1px solid var(--hairline)', minWidth: 0 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4, letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--ink)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {children}
      </div>
    </div>
  );
}

function btnStyle(variant) {
  const base = {
    all: 'unset',
    cursor: 'pointer',
    padding: '6px 12px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
  };
  if (variant === 'accent') {
    return { ...base, background: 'var(--accent)', color: 'white' };
  }
  return { ...base, border: '1px solid var(--hairline)', background: 'var(--surface)', color: 'var(--ink)' };
}

function formatAbsolute(input) {
  try {
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return String(input);
    return d.toLocaleString();
  } catch {
    return String(input);
  }
}

/** Re-export WindowTitle so the parent can render the window header in one place. */
export { WindowTitle };
