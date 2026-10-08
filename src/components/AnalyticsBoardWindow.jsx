import React from 'react';
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { useWorkspaceStore } from '../lib/store.js';
import { getAgentById } from '../lib/agentStore.js';
import { getWindowManifest } from '../lib/windowManifest.js';
import { formatDuration, summarizeCanvas, summarizeTasks } from './analytics/analyticsModel.js';

const card = { background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)', padding: 12 };
const label = { fontFamily: 'var(--font-label)', fontSize: 'var(--text-xs)', letterSpacing: 'var(--label-tracking)', textTransform: 'var(--label-case)', color: 'var(--ink-faint)' };
const STATUS = [
  { key: 'completed', label: 'Completed', color: 'var(--ps-green)' },
  { key: 'in_progress', label: 'In progress', color: 'var(--ps-blue)' },
  { key: 'queued', label: 'Queued', color: 'var(--ink-faint)' },
  { key: 'blocked', label: 'Blocked', color: 'var(--ps-pink)' },
  { key: 'failed', label: 'Failed', color: 'var(--ps-red)' },
];

function Tile({ title, value, hint }) {
  return (
    <div style={card}>
      <div style={label}>{title}</div>
      <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginTop: 4, color: 'var(--ink)' }}>{value}</div>
      {hint && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

/** Seven-day column chart of tasks created per day; hover a column for both counts. */
function DayChart({ days }) {
  const [hover, setHover] = React.useState(null);
  const max = Math.max(1, ...days.map(d => d.created));
  const W = 100 / days.length;
  return (
    <div style={{ position: 'relative' }}>
      <div role="img" aria-label="Tasks created per day, last 7 days" style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 96, borderBottom: '1px solid var(--hairline)' }}>
        {days.map((d, i) => (
          <div key={d.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ width: `${W}%`, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', cursor: 'default' }}>
            <div style={{ width: '60%', height: `${(d.created / max) * 100}%`, minHeight: d.created ? 3 : 0, background: 'var(--accent)', borderRadius: '4px 4px 0 0', opacity: hover === null || hover === i ? 1 : 0.45 }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 2 }}>
        {days.map(d => <div key={d.key} style={{ width: `${W}%`, textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', marginTop: 4 }}>{d.label}</div>)}
      </div>
      {hover !== null && (
        <div role="tooltip" style={{ position: 'absolute', top: -6, left: `calc(${(hover + 0.5) * W}% )`, transform: 'translate(-50%, -100%)', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '4px 8px', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap', boxShadow: 'var(--shadow-pop)', color: 'var(--ink)' }}>
          {days[hover].label}: {days[hover].created} created · {days[hover].completed} completed
        </div>
      )}
    </div>
  );
}

function BarList({ rows, valueKey = 'total', labelFor, suffixFor }) {
  const max = Math.max(1, ...rows.map(r => r[valueKey]));
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.map(row => (
        <div key={row.agentId || row.kind} style={{ display: 'grid', gridTemplateColumns: '96px 1fr 64px', alignItems: 'center', gap: 8, fontSize: 'var(--text-xs)' }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink-soft)' }}>{labelFor(row)}</div>
          <div style={{ height: 8, background: 'var(--surface)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ width: `${(row[valueKey] / max) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 'var(--radius-sm)' }} />
          </div>
          <div style={{ textAlign: 'right', color: 'var(--ink-soft)', fontVariantNumeric: 'tabular-nums' }}>{suffixFor(row)}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * Analytics Board: how this workspace's agents are doing. Reads the
 * workspace-scoped agent task queue and the live canvas; refreshes every
 * minute while open.
 */
export function AnalyticsBoardWindow({ win, onUpdate }) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const wins = useWorkspaceStore(state => state.wins);
  const [tasks, setTasks] = React.useState(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const qs = workspaceId ? `&workspaceId=${encodeURIComponent(workspaceId)}` : '';
      const res = await fetch(`/api/agent-tasks?limit=500${qs}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Could not load tasks (${res.status})`);
      setTasks(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  React.useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [load]);

  const summary = React.useMemo(() => summarizeTasks(tasks || []), [tasks]);
  const canvas = React.useMemo(() => summarizeCanvas(wins), [wins]);

  return (
    <>
      <WindowTitle icon={<Icon.Activity size={14} />} label={win.title || 'Analytics Board'} subtitle={tasks ? `${summary.total} agent tasks` : 'loading'} attachedAgentIds={win.attachedAgents} onDetach={(id) => onUpdate?.({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })}>
        <button type="button" aria-label="Refresh analytics" onClick={load} disabled={loading} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
          <Icon.Refresh size={12} />
        </button>
      </WindowTitle>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, display: 'grid', gap: 10, alignContent: 'start', background: 'var(--surface)', color: 'var(--ink)' }}>
        {error && <div role="status" style={{ fontSize: 'var(--text-xs)', color: 'var(--ps-red)' }}>{error}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
          <Tile title="Last 7 days" value={summary.recentCount} hint="tasks created" />
          <Tile title="Open" value={summary.open} hint="queued, running or blocked" />
          <Tile title="Success" value={summary.successRate == null ? '–' : `${Math.round(summary.successRate * 100)}%`} hint="of finished tasks" />
          <Tile title="Median time" value={formatDuration(summary.medianDurationMs)} hint="start to done" />
        </div>
        <div style={card}>
          <div style={{ ...label, marginBottom: 14 }}>Tasks created per day</div>
          <DayChart days={summary.perDay} />
        </div>
        <div style={card}>
          <div style={{ ...label, marginBottom: 8 }}>Status</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 'var(--text-xs)' }}>
            {STATUS.map(s => (
              <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--ink-soft)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 'var(--radius-xs)', background: s.color }} />
                {s.label} <b style={{ color: 'var(--ink)' }}>{summary.byStatus[s.key] || 0}</b>
              </span>
            ))}
          </div>
        </div>
        <div style={card}>
          <div style={{ ...label, marginBottom: 8 }}>Busiest agents (7 days)</div>
          {summary.agents.length === 0
            ? <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>No agent tasks in the last 7 days. Hand a task to an agent from a To-do, Idea Pad or the Scheduler.</div>
            : <BarList rows={summary.agents.slice(0, 6)} labelFor={r => getAgentById(r.agentId)?.name || r.name} suffixFor={r => `${r.completed}/${r.total} done`} />}
        </div>
        <div style={card}>
          <div style={{ ...label, marginBottom: 8 }}>On the canvas now</div>
          {canvas.length === 0
            ? <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>No windows open.</div>
            : <BarList rows={canvas.slice(0, 6)} valueKey="count" labelFor={r => getWindowManifest(r.kind)?.label || r.kind} suffixFor={r => `${r.count}`} />}
        </div>
      </div>
    </>
  );
}
