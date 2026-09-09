import React from 'react';
import { Icon } from '../Icons.jsx';
import { groupAccent, groupSoft, fieldStyle, smallSelectStyle } from './styles.js';

// Batch coordinator: paste rough goals, get a planned safe split, assign, queue.
export function SubAgentBatch({ state, subAgents, groupHue }) {
  const accentColor = groupAccent(groupHue);
  const softColor = groupSoft(groupHue);
  const {
    taskQueueBlocked, batchText, setBatchText, batchPlan, planningBatch, queuingBatch,
    batchError, planBatch, updatePlannedTask, queueBatch,
  } = state;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: 8, borderRadius: 8, border: `1px solid ${accentColor}`, background: softColor }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon.NewWorkflow size={13} color={accentColor} />
        <div style={{ fontSize: 11, fontWeight: 700, color: `oklch(0.34 0.10 ${groupHue})` }}>Batch coordinator</div>
        <div style={{ flex: 1 }} />
        {batchPlan?.summary && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)' }}>
            {batchPlan.summary.parallelSafe} parallel / {batchPlan.summary.needsSequencing} review
          </div>
        )}
      </div>
      <textarea value={batchText} onChange={e => setBatchText(e.target.value)} rows={3}
        placeholder="Paste rough goals here. The coordinator will infer likely files, overlap risk, and safer sub-agent prompts."
        disabled={taskQueueBlocked}
        style={{ ...fieldStyle, resize: 'vertical', minHeight: 58, maxHeight: 130, background: 'var(--surface)', opacity: taskQueueBlocked ? 0.65 : 1 }} />
      <button onClick={planBatch} disabled={taskQueueBlocked || !batchText.trim() || planningBatch} style={{ all: 'unset', cursor: !taskQueueBlocked && batchText.trim() && !planningBatch ? 'pointer' : 'not-allowed', padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, textAlign: 'center', background: accentColor, color: '#fff', opacity: !taskQueueBlocked && batchText.trim() && !planningBatch ? 1 : 0.5 }}>
        {planningBatch ? 'Planning...' : 'Plan safe split'}
      </button>
      {batchError && <div style={{ fontSize: 11, color: 'var(--ps-red)', lineHeight: 1.35 }}>{batchError}</div>}
      {batchPlan?.tasks?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {batchPlan.tasks.map(task => (
            <div key={task.id} style={{ padding: 7, borderRadius: 7, background: 'var(--surface)', border: `1px solid ${task.mode === 'parallel-ok' ? 'var(--hairline)' : accentColor}` }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: task.mode === 'parallel-ok' ? 'var(--ink-faint)' : accentColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {task.mode === 'parallel-ok' ? 'parallel ok' : 'sequence/review'}
                </span>
              </div>
              <select value={task.assigneeId || ''} onChange={e => updatePlannedTask(task.id, { assigneeId: e.target.value, assigneeName: subAgents.find(s => s.id === e.target.value)?.name || null })} style={{ ...smallSelectStyle, width: '100%', marginBottom: 5 }}>
                <option value="">Choose assignee...</option>
                {subAgents.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <div style={{ fontSize: 10, color: 'var(--ink-faint)', lineHeight: 1.35 }}>
                {(task.files?.length ? task.files.join(', ') : 'Needs discovery first')}
              </div>
            </div>
          ))}
          <button onClick={queueBatch} disabled={taskQueueBlocked || queuingBatch || batchPlan.tasks.some(t => !t.assigneeId)} style={{ all: 'unset', cursor: !taskQueueBlocked && !queuingBatch && !batchPlan.tasks.some(t => !t.assigneeId) ? 'pointer' : 'not-allowed', padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, textAlign: 'center', background: 'var(--ink)', color: 'var(--surface)', opacity: !taskQueueBlocked && !queuingBatch && !batchPlan.tasks.some(t => !t.assigneeId) ? 1 : 0.45 }}>
            {queuingBatch ? 'Queuing...' : 'Queue planned batch'}
          </button>
        </div>
      )}
    </div>
  );
}
