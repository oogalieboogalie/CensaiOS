import React from 'react';

function label(entry) {
  return entry.title || entry.note || entry.brief || 'Untitled Jules task';
}

// Which colour a task's dot and status pill take (the colours are in jules.css).
function tone(status) {
  if (status === 'blocked') return 'bad';
  if (status === 'inflight') return 'run';
  if (status === 'merged' || status === 'completed') return 'good';
  return 'warn';
}

function QueueItem({ entry }) {
  return (
    <div className="hb-panel jules-item" data-tone={tone(entry.status)}>
      <div className="jules-item-head">
        <span className="jules-dot" />
        <strong className="jules-item-title">{label(entry)}</strong>
        <span className="jules-pill">{entry.status}</span>
      </div>
      <div className="jules-item-meta">
        {[entry.priority, entry.session, entry.code, entry.brief].filter(Boolean).join(' · ')}
      </div>
      {(entry.detail || entry.note || entry.reason) && (
        <div className="jules-item-note" data-tone={entry.status === 'blocked' ? 'bad' : undefined}>
          {entry.detail || entry.note || entry.reason}
        </div>
      )}
      {/* Diagram 01: the review decides the merge. */}
      {entry.reviewNote && (
        <div data-testid="jules-review-note" className="jules-item-note" data-tone="warn">
          {entry.reviewNote}
        </div>
      )}
      {!entry.reviewNote && entry.review === 'pass' && (
        <div className="jules-item-note" data-tone="good">Review passed.</div>
      )}
      {entry.duplicateBriefs?.length > 0 && (
        <div className="jules-item-note">
          {entry.duplicateBriefs.length} duplicate brief{entry.duplicateBriefs.length === 1 ? '' : 's'} collapsed
        </div>
      )}
    </div>
  );
}

function Section({ title, items, empty }) {
  return (
    <section className="jules-group">
      <div className="jules-label">
        {title} · {items.length}
      </div>
      <div className="hb-well jules-tray">
        {items.length > 0
          ? items.map((entry, index) => <QueueItem key={`${entry.brief || entry.session || title}-${index}`} entry={entry} />)
          : <div className="jules-tray-empty">{empty}</div>}
      </div>
    </section>
  );
}

export function JulesQueuePanel({ queue, includeCompleted }) {
  const counts = queue?.counts || {};
  return (
    <div className="jules-section">
      <div className="jules-head">
        <strong className="jules-title">Repository Queue</strong>
        <span className="jules-counts">
          {counts.pending || 0} pending · {counts.inflight || 0} active · {counts.blocked || 0} blocked
        </span>
        {/* The queue file's own setting, used by scheduled queue runs. Overseer
            Watcher runs merge only when its own box is ticked. Unknown until loaded. */}
        {queue && (
          <span
            title={queue.autoMerge
              ? 'Scheduled queue runs merge pull requests that pass their checks. Overseer Watcher merges only when its own box is ticked.'
              : 'Queue runs merge nothing; ready pull requests wait for you.'}
            className="jules-pill jules-merge"
            data-on={queue.autoMerge ? 'true' : 'false'}
          >
            {queue.autoMerge ? 'queue merges ready PRs' : 'queue merges nothing'}
          </span>
        )}
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
