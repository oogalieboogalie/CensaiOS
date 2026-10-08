/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { renderMarkdown } from '../../lib/renderMarkdown.jsx';
import { CliMark, StatusDot, stateLabel } from './CliMark.jsx';
import { Transcript } from './Transcript.jsx';
import { ChangesPanel } from './ChangesPanel.jsx';
import { cliAgentsApi } from './cliAgentsApi.js';
import { refreshCliRoster } from './useCliRoster.js';

const CLI_LABEL = { claudecode: 'Claude Code', codex: 'Codex', gemini: 'Gemini CLI', opencode: 'OpenCode' };

function formatCost(usd) {
  if (typeof usd !== 'number') return null;
  return usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`;
}

function RawView({ taskId, live }) {
  const [lines, setLines] = React.useState([]);
  React.useEffect(() => {
    let alive = true;
    let timer;
    const load = async () => {
      try {
        const data = await cliAgentsApi.raw(taskId);
        if (alive) setLines(data.lines || []);
      } catch { /* keep last */ }
      if (alive && live) timer = setTimeout(load, 2000);
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [taskId, live]);
  return <pre className="ac-raw" data-testid="agent-raw">{lines.length ? lines.join('\n') : 'No output yet.'}</pre>;
}

function HandoffPanel({ task, onClose, onHandoff }) {
  const others = Object.keys(CLI_LABEL).filter((id) => id !== task.cli);
  const [target, setTarget] = React.useState(others[0]);
  const [instruction, setInstruction] = React.useState(`Review the changes ${task.cliLabel} made. Point out bugs and risky spots, and fix anything clearly wrong.`);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await onHandoff(target, instruction);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ac-handoff" data-testid="agent-handoff">
      <div className="ac-handoff-row">
        <span className="ac-label">Hand off to</span>
        <div className="ac-seg" role="radiogroup" aria-label="Hand off to">
          {[...others, 'chat'].map((id) => (
            <button key={id} type="button" role="radio" aria-checked={target === id} className={`ac-seg-btn${target === id ? ' ac-seg-btn--on' : ''}`} onClick={() => setTarget(id)}>
              {id === 'chat' ? 'Chat agent' : CLI_LABEL[id]}
            </button>
          ))}
        </div>
      </div>
      <textarea className="ac-input ac-textarea" rows={3} value={instruction} onChange={(e) => setInstruction(e.target.value)} aria-label="What should they do" />
      <div className="ac-muted">{target === 'chat' ? 'Opens a chat with the summary and diff.' : 'Starts a new console in its own worktree with these changes applied.'}</div>
      {error && <div className="ac-error" role="alert"><Icon.Alert size={13} />{error}</div>}
      <div className="ac-handoff-row ac-handoff-row--end">
        <button type="button" className="ac-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="ac-btn ac-btn--primary" disabled={busy} onClick={send} data-testid="agent-handoff-send">{busy ? 'Sending…' : 'Send'}</button>
      </div>
    </div>
  );
}

export function TaskView({ taskId, live: liveState, onSpawn, onNewTask }) {
  const { task, items, changes, error, poll, loadChanges, live } = liveState;
  const [tab, setTab] = React.useState('transcript');
  const [followUp, setFollowUp] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState(null);
  const [handoffOpen, setHandoffOpen] = React.useState(false);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);

  const act = async (fn) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await poll();
      refreshCliRoster();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const decide = (permissionId, allow) => act(() => cliAgentsApi.decide(taskId, permissionId, allow));
  const openFile = async (filePath) => {
    try {
      const { content } = await cliAgentsApi.file(taskId, filePath);
      const name = filePath.split('/').pop();
      onSpawn?.('code_editor', { title: `${name} · ${task?.cliLabel || 'agent'}`, fileName: name, code: content });
    } catch (err) {
      setActionError(err.message);
    }
  };
  const openAllChanged = () => (changes.files || []).filter((f) => f.change !== 'deleted').slice(0, 6).forEach((f) => openFile(f.path));

  const handoff = async (target, instruction) => {
    if (target === 'chat') {
      const data = await cliAgentsApi.changes(taskId);
      const text = [
        instruction,
        '',
        `${task.cliLabel} worked on "${task.title}" (branch ${task.worktree?.branch}).`,
        task.summary ? `Summary: ${task.summary}` : null,
        `Files: ${(data.files || []).map((f) => f.path).join(', ') || 'none'}`,
        data.patch ? `\n\`\`\`diff\n${data.patch.slice(0, 12000)}\n\`\`\`` : null,
      ].filter((l) => l != null).join('\n');
      onSpawn?.('chat', { agentId: 'censai', title: `Review: ${task.title}`, msgs: [{ from: 'me', text }], autoSend: true });
      return;
    }
    const { task: next } = await cliAgentsApi.handoff(taskId, target, instruction);
    onSpawn?.('agentConsole', { taskId: next.id, cli: next.cli, title: next.cliLabel });
    refreshCliRoster(true);
  };

  if (error && !task) return <div className="ac-empty">{error} <button type="button" className="ac-link" onClick={onNewTask}>New task</button></div>;
  if (!task) return <div className="ac-empty">Loading task…</div>;

  const cost = formatCost(task.costUsd);
  const fileCount = changes.files?.length || 0;
  return (
    <div className="ac-task">
      <div className="ac-task-head">
        <CliMark cli={task.cli} active={live} />
        <div className="ac-task-head-text">
          <div className="ac-task-title" title={task.prompt}>{task.title}</div>
          <div className="ac-task-meta">
            <span className="ac-chip" data-testid="task-status"><StatusDot state={task.status} />{task.status === 'installing' ? (task.install?.phase || 'Installing') : stateLabel(task.status)}</span>
            <span className="ac-mono" title={task.worktree?.dir}><Icon.Branch size={11} />{task.worktree?.branch}</span>
            {cost && <span>{cost}</span>}
            {task.usage?.output != null && <span>{task.usage.output.toLocaleString()} tokens out</span>}
            <span>by {task.createdBy?.name || 'you'}</span>
          </div>
        </div>
        {live
          ? <button type="button" className="ac-btn ac-btn--danger" disabled={busy} onClick={() => act(() => cliAgentsApi.stop(taskId))} data-testid="agent-stop"><Icon.Stop size={12} />Stop</button>
          : <button type="button" className="ac-btn" onClick={onNewTask}><Icon.Plus size={12} />New task</button>}
      </div>
      {task.status === 'installing' && (
        <div className="ac-progress ac-progress--bar" role="progressbar" aria-valuenow={Math.round((task.install?.progress || 0) * 100)}>
          <div className="ac-progress-track"><div className="ac-progress-fill" style={{ width: `${Math.round((task.install?.progress || 0) * 100)}%` }} /></div>
        </div>
      )}
      <div className="ac-tabs" role="tablist">
        {[['transcript', 'Transcript'], ['changes', `Changes${fileCount ? ` ${fileCount}` : ''}`], ['raw', 'Raw output']].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`ac-tab${tab === id ? ' ac-tab--on' : ''}`}
            onClick={() => { setTab(id); if (id === 'changes') loadChanges(); }} data-testid={`tab-${id}`}>{label}</button>
        ))}
        {task.pendingApprovals > 0 && <span className="ac-tab-flag"><Icon.Shield size={11} />{task.pendingApprovals} waiting for you</span>}
      </div>
      <div className="ac-task-body">
        {tab === 'transcript' && <Transcript items={items} onDecide={decide} onOpenFile={openFile} live={live && task.status !== 'needs_approval'} />}
        {tab === 'changes' && <ChangesPanel changes={changes} onOpenFile={openFile} />}
        {tab === 'raw' && <RawView taskId={taskId} live={live} />}
      </div>
      {actionError && <div className="ac-error ac-error--bar" role="alert"><Icon.Alert size={13} />{actionError}</div>}
      {!live && (
        <div className="ac-task-foot">
          {task.summary && task.status === 'done' && (
            <div className="ac-summary" data-testid="agent-summary">
              <div className="ac-summary-head"><Icon.Check size={12} />Finished · {fileCount} file{fileCount === 1 ? '' : 's'} changed</div>
              <div className="ac-summary-text">{renderMarkdown(task.summary, { compact: true })}</div>
            </div>
          )}
          {handoffOpen
            ? <HandoffPanel task={task} onClose={() => setHandoffOpen(false)} onHandoff={handoff} />
            : (
              <div className="ac-actions">
                <button type="button" className="ac-btn" disabled={!fileCount} onClick={openAllChanged}><Icon.Code size={12} />Open in Code Editor</button>
                <button type="button" className="ac-btn" onClick={() => setHandoffOpen(true)} data-testid="agent-handoff-open"><Icon.ArrowAssign size={12} />Hand off</button>
                <span className="ac-spacer" />
                <button type="button" className={`ac-btn${confirmDiscard ? ' ac-btn--danger' : ''}`} disabled={busy}
                  onClick={() => (confirmDiscard ? act(async () => { await cliAgentsApi.discard(taskId); onNewTask(); }) : setConfirmDiscard(true))}
                  onBlur={() => setConfirmDiscard(false)}>
                  {confirmDiscard ? 'Discard worktree?' : 'Discard'}
                </button>
              </div>
            )}
          <form className="ac-followup" onSubmit={(e) => { e.preventDefault(); if (followUp.trim()) act(async () => { await cliAgentsApi.message(taskId, followUp); setFollowUp(''); }); }}>
            <input className="ac-input" value={followUp} onChange={(e) => setFollowUp(e.target.value)}
              placeholder={task.status === 'stopped' ? 'Resume with a message…' : 'Ask a follow-up (resumes the same session)…'} aria-label="Follow-up message" data-testid="agent-followup" />
            <button type="submit" className="ac-btn ac-btn--primary" disabled={busy || !followUp.trim()} aria-label="Send follow-up"><Icon.Send size={12} /></button>
          </form>
        </div>
      )}
    </div>
  );
}
