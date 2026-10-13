import React from 'react';

function label(entry) {
  return entry.title || entry.note || entry.brief || 'Untitled Jules task';
}

function tone(status) {
  if (status === 'blocked') return 'var(--ps-red)';
  if (status === 'needs_split') return 'var(--ps-yellow)';
  if (status === 'inflight') return 'var(--ps-blue)';
  if (status === 'merged' || status === 'completed') return 'var(--ps-green)';
  return 'var(--ps-yellow)';
}

function QueueItem({ entry }) {
  return (
    <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-2)', padding: 9, display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        <span style={{ width: 7, height: 7, flex: '0 0 auto', borderRadius: '50%', background: tone(entry.status) }} />
        <strong style={{ minWidth: 0, fontSize: 'var(--text-sm)', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label(entry)}
        </strong>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-label)', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', textTransform: 'var(--label-case)' }}>
          {entry.status}
        </span>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {[entry.priority, entry.session, entry.code, entry.brief].filter(Boolean).join(' · ')}
      </div>
      {(entry.detail || entry.note || entry.reason) && (
        <div style={{ fontSize: 'var(--text-xs)', color: entry.status === 'blocked' ? 'var(--ps-red)' : 'var(--ink-soft)' }}>
          {entry.detail || entry.note || entry.reason}
        </div>
      )}
      {entry.duplicateBriefs?.length > 0 && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>
          {entry.duplicateBriefs.length} duplicate brief{entry.duplicateBriefs.length === 1 ? '' : 's'} collapsed
        </div>
      )}
    </div>
  );
}

function Section({ title, items, empty }) {
  return (
    <section style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontFamily: 'var(--font-label)', fontSize: 'var(--text-xs)', fontWeight: 800, color: 'var(--ink-faint)', textTransform: 'var(--label-case)', letterSpacing: 'var(--label-tracking)' }}>
        {title} · {items.length}
      </div>
      {items.length > 0
        ? items.map((entry, index) => <QueueItem key={`${entry.brief || entry.session || title}-${index}`} entry={entry} />)
        : <div style={{ padding: 9, border: '1px dashed var(--hairline)', borderRadius: 'var(--radius-lg)', color: 'var(--ink-faint)', fontSize: 'var(--text-xs)' }}>{empty}</div>}
    </section>
  );
}

export function JulesQueuePanel({ queue, includeCompleted }) {
  const counts = queue?.counts || {};
  return (
    <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)', background: 'var(--surface)', padding: 10, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)' }}>Repository Queue</strong>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>
          {counts.pending || 0} pending · {counts.inflight || 0} active · {counts.blocked || 0} blocked
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: queue?.autoMerge ? 'var(--ps-green)' : 'var(--ps-yellow)' }}>
          auto-merge {queue?.autoMerge ? 'on' : 'off'}
        </span>
      </div>
      <Section title="In flight" items={queue?.inflight || []} empty="No Jules task is currently running." />
      <Section title="Pending" items={queue?.pending || []} empty="No pending handoff briefs." />
      <Section title="Blocked" items={queue?.blocked || []} empty="No blocked queue entries." />
      {includeCompleted && (
        <Section title="Dispatched history" items={(queue?.dispatched || []).slice(-10).reverse()} empty="No dispatch history." />
      )}
    </div>
  );
}
