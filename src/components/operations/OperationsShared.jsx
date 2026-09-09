import React from 'react';
import { Icon } from '../Icons.jsx';
import { getAgentById } from '../../lib/agentStore.js';

export { buildActiveAgents } from './buildActiveAgents.js';

export const RUNNING_TASK_STATUSES = new Set(['queued', 'in_progress']);
export const ACTIVE_JULES_STATUSES = new Set([
  'QUEUED', 'PLANNING', 'IN_PROGRESS', 'AWAITING_PLAN_APPROVAL', 'AWAITING_USER_FEEDBACK',
]);

export function fmtTime(value) {
  if (!value) return 'never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'never';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function statusTone(status) {
  const value = String(status || '').toLowerCase();
  if (value.includes('fail') || value.includes('error') || value.includes('blocked')) return 'bad';
  if (value.includes('running') || value.includes('progress') || value.includes('queued') || value.includes('active')) return 'live';
  if (value.includes('awaiting')) return 'warn';
  if (value.includes('complete') || value.includes('done') || value.includes('ready') || value.includes('merged') || value.includes('approved')) return 'good';
  return 'quiet';
}

export function toneColor(tone) {
  if (tone === 'bad') return 'var(--ps-red)';
  if (tone === 'warn') return 'var(--ps-yellow)';
  if (tone === 'good') return 'var(--ps-green)';
  if (tone === 'live') return 'var(--ps-blue)';
  return 'var(--ink-faint)';
}

export function countByStatus(items) {
  return items.reduce((acc, item) => {
    const key = item.status || 'active';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

export function normalizeSchedule(schedule = {}, subAgents = []) {
  const agentId = schedule.agentId || schedule.agent_id || schedule.assignee_id || null;
  const subAgent = subAgents.find(agent => agent.id === agentId);
  return {
    ...schedule,
    agentId,
    agentName: schedule.agentName || schedule.agent_name || subAgent?.name || agentId,
    projectName: schedule.projectName || schedule.project_name || schedule.project || schedule.project_id || null,
    taskText: schedule.taskText || schedule.task_text || schedule.title || '',
    date: schedule.date || schedule.scheduled_date || null,
    time: schedule.time || schedule.scheduled_time || null,
    nextRunAt: schedule.nextRunAt || schedule.next_run_at || null,
    lastRunAt: schedule.lastRunAt || schedule.last_run_at || null,
    lastError: schedule.lastError || schedule.last_error || null,
    status: schedule.status || 'active',
  };
}

export function iconButtonStyle(disabled) {
  return {
    all: 'unset', cursor: disabled ? 'wait' : 'pointer', width: 24, height: 24,
    borderRadius: 7, display: 'grid', placeItems: 'center',
    color: disabled ? 'var(--ink-faint)' : 'var(--accent-ink)',
    background: disabled ? 'var(--surface-2)' : 'var(--accent-soft)',
    border: '1px solid var(--hairline)',
  };
}

export function Metric({ label, value, tone }) {
  return (
    <div style={{ minWidth: 0, padding: '9px 10px', border: '1px solid var(--hairline)', borderRadius: 8, background: 'var(--surface-2)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ marginTop: 3, fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, color: toneColor(tone), textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  );
}

export function Panel({ title, action, children }) {
  return (
    <section style={{ border: '1px solid var(--hairline)', borderRadius: 8, background: 'var(--surface)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderBottom: '1px solid var(--hairline)', background: 'var(--surface-2)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</div>
        <div style={{ flex: 1 }} />
        {action}
      </div>
      <div style={{ padding: 10, display: 'grid', gap: 8 }}>{children}</div>
    </section>
  );
}

export function WorkerLine({ label, ready, detail }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '10px minmax(84px, auto) minmax(0, 1fr)', gap: 8, alignItems: 'center' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: ready ? 'var(--ps-green)' : 'var(--ps-red)', boxShadow: ready ? '0 0 8px var(--ps-green)' : 'none' }} />
      <span style={{ fontSize: 12, fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 11, color: ready ? 'var(--ink-faint)' : 'var(--ps-red)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail}</span>
    </div>
  );
}

export function StatusBars({ counts, total }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <Empty text="No items to summarize." />;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {entries.map(([status, count]) => {
        const pct = total > 0 ? Math.max(5, Math.round((count / total) * 100)) : 0;
        return (
          <div key={status} style={{ display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr) 30px', gap: 8, alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-faint)', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{status}</span>
            <div style={{ height: 7, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden', border: '1px solid var(--hairline)' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: toneColor(statusTone(status)) }} />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-soft)', textAlign: 'right' }}>{count}</span>
          </div>
        );
      })}
    </div>
  );
}

export function CompactList({ items, empty, render }) {
  if (!items.length) return <Empty text={empty} />;
  return <div style={{ display: 'grid', gap: 6 }}>{items.map(render)}</div>;
}

export function Row({ dotTone, title, meta, right, href, onClick }) {
  const isClickable = Boolean(href || onClick);
  const content = (
    <div style={{ display: 'grid', gridTemplateColumns: '10px minmax(0, 1fr) auto', gap: 8, alignItems: 'center', padding: 8, border: '1px solid var(--hairline)', borderRadius: 8, background: isClickable ? 'var(--surface-hover)' : 'var(--surface-2)' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: toneColor(dotTone), boxShadow: dotTone === 'live' ? `0 0 8px ${toneColor(dotTone)}` : 'none' }} />
      <span style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {meta && <div style={{ marginTop: 2, fontSize: 10.5, color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</div>}
      </span>
      {right && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: isClickable ? 'var(--accent-ink)' : 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{right}</span>}
    </div>
  );
  if (href) return <a href={href} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{content}</a>;
  if (onClick) return <div onClick={onClick} style={{ cursor: 'pointer' }}>{content}</div>;
  return content;
}

export function Empty({ text }) {
  return (
    <div style={{ padding: 14, border: '1px dashed var(--hairline)', borderRadius: 8, color: 'var(--ink-faint)', fontSize: 12, textAlign: 'center' }}>
      {text}
    </div>
  );
}
