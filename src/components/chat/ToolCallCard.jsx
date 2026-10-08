/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { describeToolEvent, formatMs } from './toolActivity.js';

const ICONS = {
  Tools: Icon.Tools,
  Files: Icon.Files,
  Folder: Icon.Folder,
  Memory: Icon.Memory,
  Bot: Icon.Bot,
  Send: Icon.Send,
  Search: Icon.Search,
  Calendar: Icon.Calendar,
  Toolbox: Icon.Toolbox,
};

/**
 * One tool call as a one-line card (spec 3): an icon per tool type, what it
 * did, and its numbers. Click to see the details. `running` cards pulse.
 *
 * detail: { tool, summary?, args?, ms?, ok?, resultChars? }
 */
export function ToolCallCard({ detail, running = false }) {
  const [open, setOpen] = React.useState(false);
  const d = describeToolEvent(detail, { past: !running });
  const failed = !running && d.ok === false;
  const Glyph = failed ? Icon.Close : (ICONS[d.icon] || Icon.Tools);
  const summary = detail?.summary || {};
  const chars = Number.isFinite(detail?.resultChars) ? detail.resultChars : null;
  const rows = [
    ['Tool', detail?.tool || 'tool'],
    summary.path ? ['File', summary.path] : null,
    summary.target ? ['Target', summary.target] : null,
    summary.files > 1 ? ['Files', String(summary.files)] : null,
    d.stats ? ['Lines', d.stats.label] : null,
    d.ms !== null ? ['Took', formatMs(d.ms)] : null,
    chars !== null ? ['Result', `${chars.toLocaleString()} characters`] : null,
    failed ? ['Outcome', 'Failed'] : null,
  ].filter(Boolean);

  return (
    <div className="hb-tool" data-open={open ? 'true' : 'false'} data-state={running ? 'running' : 'done'}
      data-outcome={running ? undefined : (failed ? 'failed' : 'ok')}>
      <button type="button" className="hb-tool-row" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="hb-tool-icon" data-tool-outcome={running ? undefined : (failed ? 'failed' : 'ok')}><Glyph size={13} /></span>
        <span className="hb-tool-label">{failed ? `${d.label} · failed` : d.label}</span>
        {d.stats?.added > 0 && <span className="hb-tool-meta hb-tool-added">+{d.stats.added}</span>}
        {d.stats?.removed > 0 && <span className="hb-tool-meta">−{d.stats.removed}</span>}
        {d.ms !== null && <span className="hb-tool-meta">{formatMs(d.ms)}</span>}
        <span className="hb-tool-chevron" aria-hidden="true"><Icon.Chevron size={12} /></span>
      </button>
      {open && (
        <dl className="hb-tool-detail">
          {rows.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}
        </dl>
      )}
    </div>
  );
}

const VISIBLE = 4;

/** A run of tool cards; long runs fold the oldest behind a "N earlier steps" row. */
export function ToolCallList({ tools = [], running = null }) {
  const [showAll, setShowAll] = React.useState(false);
  if (tools.length === 0 && !running) return null;
  const hidden = showAll ? 0 : Math.max(0, tools.length - VISIBLE);
  return (
    <div className="hb-tool-list" data-testid="tool-call-list">
      {hidden > 0 && (
        <button type="button" className="hb-text-btn" onClick={() => setShowAll(true)}>
          {hidden} earlier step{hidden === 1 ? '' : 's'}
        </button>
      )}
      {tools.slice(hidden).map((t, i) => <ToolCallCard key={`${t.tool}-${hidden + i}`} detail={t} />)}
      {running && <ToolCallCard key="running" detail={running} running />}
    </div>
  );
}

/** Persisted message activity → card details. */
export function toolsFromActivity(activity) {
  return (activity?.tools || []).map(t => ({
    tool: t.name,
    summary: t.summary,
    ms: t.ms,
    ok: t.ok,
    resultChars: t.resultChars,
  }));
}
