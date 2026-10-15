/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { useCliTask } from '../../agentConsole/useCliTask.js';
import { ItemMark, STATE_LABEL, timeAgo } from './InboxParts.jsx';
import { fixActionFor } from './useInboxFixes.js';

const FIX_LABEL = { fix_ci: 'Have an agent fix it', fix_conflicts: 'Fix conflicts', fix_error: 'Have an agent fix it' };

/** One line per transcript step, newest last, the way a terminal reads. */
export function logLine(step) {
  if (step.kind === 'message' || step.kind === 'note' || step.kind === 'error') return String(step.text || '').split('\n')[0];
  if (step.kind === 'command') return `$ ${step.command || step.title || ''}`;
  if (step.kind === 'edit') return `Edited ${step.path || 'a file'}`;
  if (step.kind === 'read') return `Read ${step.path || 'a file'}`;
  if (step.kind === 'search') return step.title || 'Searched';
  if (step.kind === 'permission') return `Waiting for your OK: ${step.title || 'a step'}`;
  if (step.kind === 'prompt') return `> ${String(step.text || '').split('\n')[0]}`;
  return '';
}

function Approvals({ approvals, onAnswer }) {
  if (!approvals?.length) return null;
  return (
    <div className="hb-inbox-approvals">
      {approvals.map((a) => (
        <div key={a.id} className="hb-inbox-approval">
          <span>Allow: {a.title}</span>
          <button type="button" className="hb-btn" onClick={() => onAnswer(a.id, false)}>Deny</button>
          <button type="button" className="hb-btn" data-primary="true" onClick={() => onAnswer(a.id, true)}>Allow</button>
        </div>
      ))}
    </div>
  );
}

function AgentLog({ taskId, label, onAnswer }) {
  const { task, items, permissions, live } = useCliTask(taskId);
  const lines = items.map((s) => ({ id: s.id, kind: s.kind, text: logLine(s) })).filter((l) => l.text).slice(-7);
  const pending = (permissions || []).filter((p) => p.status === 'pending');
  return (
    <div className="hb-inbox-log" aria-live="polite">
      <div className="hb-inbox-log-head">
        <Icon.Terminal size={12} /> {task?.cliLabel || label || 'Agent'}
        <span className="hb-inbox-log-state" data-live={live ? 'true' : 'false'}>{live ? 'Working' : task?.status === 'done' ? 'Finished' : task?.status || '…'}</span>
      </div>
      <div className="hb-inbox-log-lines">
        {lines.map((l) => <div key={l.id} className="hb-inbox-log-line" data-kind={l.kind}>{l.text}</div>)}
        {live ? <div className="hb-inbox-log-line hb-inbox-log-working"><span className="ac-spinner" aria-hidden="true" /> Working…</div> : null}
        {!lines.length && !live ? <div className="hb-inbox-log-line">Nothing logged yet.</div> : null}
      </div>
      <Approvals approvals={pending} onAnswer={(id, allow) => onAnswer(taskId, id, allow)} />
    </div>
  );
}

export function InboxDetail({ item, act, onFix, onOpen, onAcknowledge, onAnswer }) {
  if (!item) {
    return (
      <div className="hb-inbox-detail hb-inbox-empty">
        <Icon.Check size={22} />
        <p>Nothing needs you.</p>
        <span>Red checks, conflicts, agents waiting for an OK and errors land here.</span>
      </div>
    );
  }
  const fixAction = fixActionFor(item);
  const fixing = act?.state === 'fixing';
  const taskId = item.taskId || act?.taskId || null;
  const canOpen = item.kind === 'pr' || item.kind === 'agent';
  return (
    <div className="hb-inbox-detail">
      <header className="hb-inbox-detail-head">
        <ItemMark item={item} />
        <div className="hb-inbox-detail-title">
          <h3>{item.title}</h3>
          <p>
            <span className="hb-inbox-pill" data-tone={item.tone}>{STATE_LABEL[item.state] || item.state}</span>
            <span>{[item.repo, item.by, timeAgo(item.at) && `${timeAgo(item.at)} ago`.replace('now ago', 'just now')].filter(Boolean).join(' · ')}</span>
          </p>
        </div>
        {canOpen ? <button type="button" className="hb-btn" onClick={() => onOpen(item)}>{item.kind === 'pr' ? 'Open PR' : 'Open agent'} <kbd>O</kbd></button> : null}
      </header>

      <div className="hb-inbox-stats">
        {item.stats.map((s) => (
          <div key={s.label} className="hb-inbox-stat">
            <span>{s.label}</span>
            <strong data-tone={s.tone || 'neutral'}>{s.value}</strong>
          </div>
        ))}
      </div>

      {item.kind === 'pr' && item.subtitle && item.state !== 'green' ? <p className="hb-inbox-sub">{item.subtitle}</p> : null}
      {item.summary ? <p className="hb-inbox-summary">{item.summary}</p> : null}
      {item.failing?.length ? (
        <ul className="hb-inbox-failing">{item.failing.map((f) => <li key={f}><Icon.Close size={10} /> {f}</li>)}</ul>
      ) : null}

      {act ? (
        <p className="hb-inbox-activity" data-state={act.state}>
          {act.state === 'fixing' ? <span className="ac-spinner" aria-hidden="true" /> : null}
          <strong>{act.by}</strong> {act.text}
        </p>
      ) : null}
      {taskId ? <AgentLog taskId={taskId} label={item.cliLabel} onAnswer={onAnswer} /> : null}

      <footer className="hb-inbox-actions">
        {fixAction ? (
          <button type="button" className="hb-btn" data-primary="true" disabled={fixing} onClick={() => onFix(item)}>
            {fixing ? 'Agent working…' : FIX_LABEL[fixAction]} <kbd>F</kbd>
          </button>
        ) : null}
        <span className="hb-inbox-spacer" />
        <button type="button" className="hb-btn hb-inbox-ack" onClick={() => onAcknowledge(item)}>
          <Icon.Check size={12} /> Acknowledge <kbd>E</kbd>
        </button>
      </footer>
    </div>
  );
}
