/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { CliMark } from '../../agentConsole/CliMark.jsx';

export function timeAgo(iso, now = Date.now()) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'now';
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export const STATE_LABEL = {
  ci_failed: 'Checks failed', conflict: 'Conflict', checks_running: 'Checks running',
  green: 'Ready to land', draft_green: 'Draft, green',
  needs_approval: 'Needs your OK', agent_failed: 'Agent stopped', agent_running: 'In progress',
  agent_done: 'Finished', agent_stopped: 'Stopped',
  agent_note: 'Note', todo_for_you: 'Your to-do', invite_for_you: 'Invite', error: 'Error', error_escalating: 'Escalating', error_fixing: 'Being fixed',
};

/** The small mark at the start of a row: GitHub for PRs, the CLI's own mark for agents. */
export function ItemMark({ item }) {
  if (item.kind === 'agent') return <CliMark cli={item.cli} size="sm" active={item.group === 'working'} />;
  const Mark = item.kind === 'pr' ? Icon.Github : item.kind === 'note' ? Icon.Bot : item.kind === 'todo' ? Icon.Check : item.kind === 'invite' ? Icon.Group : Icon.Alert;
  return <span className="hb-inbox-mark" data-tone={item.tone} aria-hidden="true"><Mark size={13} /></span>;
}

export function InboxList({ groups, items, selectedId, activity, onSelect }) {
  const now = Date.now();
  return (
    <div className="hb-inbox-list" role="listbox" aria-label="Inbox">
      {groups.map((g) => {
        const rows = items.filter((i) => i.group === g.id);
        if (!rows.length) return null;
        return (
          <section key={g.id} className="hb-inbox-group">
            <h4 className="hb-inbox-group-label">{g.label} <span>{rows.length}</span></h4>
            {rows.map((item) => {
              const act = activity[item.id];
              return (
                <button key={item.id} type="button" role="option" aria-selected={item.id === selectedId}
                  className="hb-inbox-row" data-tone={item.tone} onClick={() => onSelect(item.id)}>
                  <ItemMark item={item} />
                  <span className="hb-inbox-row-text">
                    <span className="hb-inbox-row-title">{item.title}</span>
                    <span className="hb-inbox-row-sub">{act ? `${act.by}: ${act.text}` : item.subtitle}</span>
                  </span>
                  <span className="hb-inbox-row-time">{timeAgo(item.at, now)}</span>
                </button>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

/**
 * The slim rail on the window's edge: one dot per item that needs someone
 * or is moving, and on hover what every agent is doing, by repo, with the
 * tokens each kind of agent used over the last few days.
 */
export function InboxDock({ items, dock, needs, onSelect }) {
  const [open, setOpen] = React.useState(false);
  const dots = items.filter((i) => i.group === 'needs' || i.group === 'working').slice(0, 8);
  const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
  return (
    <aside className="hb-inbox-dock" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      <span className="hb-inbox-dock-icon" title="Inbox">
        <Icon.Inbox size={15} />
        {needs ? <span className="hb-inbox-badge">{needs}</span> : null}
      </span>
      <div className="hb-inbox-dock-dots">
        {dots.map((i) => (
          <button key={i.id} type="button" className="hb-inbox-dot" data-tone={i.tone} data-moving={i.group === 'working' ? 'true' : 'false'}
            title={i.title} aria-label={i.title} onClick={() => onSelect(i.id)} />
        ))}
      </div>
      {open ? (
        <div className="hb-inbox-dock-pop" role="dialog" aria-label="What the agents are doing">
          {dock?.repos?.length ? dock.repos.map((r) => (
            <div key={r.repo} className="hb-inbox-pop-repo">
              <h5>{r.repo}</h5>
              {r.tasks.map((t) => (
                <button key={t.taskId} type="button" className="hb-inbox-pop-task" onClick={() => onSelect(`agent:${t.taskId}`)}>
                  <span className="hb-inbox-dot" data-tone={t.state === 'needs_approval' ? 'warning' : 'success'} aria-hidden="true" />
                  <CliMark cli={t.cli} size="sm" />
                  <span>{t.title}</span>
                </button>
              ))}
            </div>
          )) : <p className="hb-inbox-pop-empty">No agents working right now.</p>}
          {dock?.tokens?.length ? (
            <p className="hb-inbox-pop-tokens">{dock.tokens.map((t) => `${t.label} ${fmt(t.total)}`).join(' · ')} tokens in {dock.days} days</p>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

export function UndoToast({ undo, onUndo }) {
  if (!undo) return null;
  return (
    <div className="hb-inbox-toast" role="status">
      <span><strong>Acknowledged</strong> {undo.title}</span>
      <button type="button" className="hb-inbox-key-btn" onClick={onUndo}>Undo <kbd>U</kbd></button>
    </div>
  );
}
