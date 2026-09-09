import React from 'react';
import { groupAccent, fieldStyle, smallSelectStyle } from './styles.js';

export function TaskWorkerStatus({ dbReady, workerReady, degradedState, workerMessage, loadError, groupHue }) {
  const okColor = `oklch(0.58 0.14 ${groupHue})`;
  const badColor = 'oklch(0.55 0.18 25)';
  const stateColor = degradedState ? badColor : okColor;

  return (
    <div style={{ padding: 8, borderRadius: 7, background: degradedState ? 'oklch(0.96 0.03 25)' : 'var(--surface-2)', border: `1px solid ${degradedState ? badColor : 'var(--hairline)'}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
        <StatusPill label="DB" value={dbReady ? 'ready' : 'not ready'} active={dbReady} groupHue={groupHue} />
        <StatusPill label="Worker" value={workerReady ? 'ready' : 'blocked'} active={workerReady} groupHue={groupHue} />
        <StatusPill label="State" value={degradedState || 'ready'} active={!degradedState} groupHue={groupHue} />
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.35, color: stateColor, overflowWrap: 'anywhere' }}>
        {workerMessage}
      </div>
      {loadError && (
        <div style={{ fontSize: 10, lineHeight: 1.35, color: 'var(--ink-faint)', overflowWrap: 'anywhere' }}>
          Task API: {loadError}
        </div>
      )}
    </div>
  );
}

function StatusPill({ label, value, active, groupHue }) {
  return (
    <div style={{ minWidth: 0, padding: '5px 6px', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: active ? `oklch(0.50 0.14 ${groupHue})` : 'oklch(0.55 0.18 25)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  );
}

// Single-task creation form (assignee / priority / title / prompt).
export function SubAgentTaskForm({ state, subAgents, groupHue }) {
  const accentColor = groupAccent(groupHue);
  const {
    taskQueueBlocked, taskAssignee, setTaskAssignee, taskPriority, setTaskPriority,
    taskTitle, setTaskTitle, taskPrompt, setTaskPrompt, createTask,
  } = state;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 86px', gap: 4 }}>
      <select value={taskAssignee} onChange={e => setTaskAssignee(e.target.value)} style={smallSelectStyle}>
        {subAgents.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select value={taskPriority} onChange={e => setTaskPriority(e.target.value)} style={smallSelectStyle}>
        <option value="low">low</option>
        <option value="normal">normal</option>
        <option value="high">high</option>
      </select>
      <input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Task title..." onKeyDown={e => { if (e.key === 'Enter') createTask(); }}
        disabled={taskQueueBlocked}
        style={{ ...fieldStyle, gridColumn: '1 / -1', opacity: taskQueueBlocked ? 0.65 : 1 }} />
      <textarea value={taskPrompt} onChange={e => setTaskPrompt(e.target.value)} placeholder="Prompt for one sub-agent..." rows={2}
        disabled={taskQueueBlocked}
        style={{ ...fieldStyle, gridColumn: '1 / -1', resize: 'vertical', minHeight: 44, maxHeight: 90, opacity: taskQueueBlocked ? 0.65 : 1 }} />
      <button onClick={createTask} disabled={taskQueueBlocked || !taskAssignee || !taskTitle.trim() || !taskPrompt.trim()} style={{ all: 'unset', gridColumn: '1 / -1', cursor: !taskQueueBlocked && taskAssignee && taskTitle.trim() && taskPrompt.trim() ? 'pointer' : 'not-allowed', padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, textAlign: 'center', background: accentColor, color: '#fff', opacity: !taskQueueBlocked && taskAssignee && taskTitle.trim() && taskPrompt.trim() ? 1 : 0.5 }}>
        Create single task
      </button>
    </div>
  );
}

// Per-sub-agent recent task list (top 3 each).
export function SubAgentRecentTasks({ state, subAgents, groupHue }) {
  const accentColor = groupAccent(groupHue);
  const { tasksForSub, taskQueueBlocked, workerMessage, blockedTaskStatus } = state;

  return subAgents.map(s => {
    const recent = tasksForSub(s.id);
    return (
      <div key={`tasks-${s.id}`} style={{ padding: '6px 8px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: recent.length ? 4 : 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)' }}>{s.name}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{recent.length ? `${recent.length} recent` : 'no tasks'}</span>
        </div>
        {recent.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {recent.map(t => (
              <div key={t.id} title={taskQueueBlocked && (t.status || 'queued') === 'queued' ? `${t.prompt || ''}\n${workerMessage}` : t.prompt} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(56px, 82px)', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: t.priority === 'high' ? accentColor : 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.priority || 'normal'}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: t.error || (taskQueueBlocked && (t.status || 'queued') === 'queued') ? 'oklch(0.55 0.18 25)' : 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right' }}>{t.error ? 'error' : taskQueueBlocked && (t.status || 'queued') === 'queued' ? blockedTaskStatus : t.status || 'queued'}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>No delegated tasks yet.</div>
        )}
      </div>
    );
  });
}
