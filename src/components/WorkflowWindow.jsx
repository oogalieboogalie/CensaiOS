import React from 'react';
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import { Icon } from './Icons.jsx';
import { AgentAvatar } from './Agents.jsx';
import { getAgentById, getAgents } from '../lib/agentStore.js';
import { WindowTitle } from './Windows.jsx';
import { DEFAULT_WORKFLOW, moveStep, newStepId, workflowSteps } from './workflow/workflowModel.js';
import { useWorkflowRun } from './workflow/useWorkflowRun.js';

const btn = { all: 'unset', cursor: 'pointer', padding: '4px 10px', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', fontWeight: 600, fontFamily: 'var(--font-mono)', border: '1px solid var(--hairline)', color: 'var(--ink-soft)' };
const primaryBtn = { ...btn, background: 'var(--accent)', color: 'var(--accent-contrast)', border: '1px solid transparent' };
const iconBtn = { all: 'unset', cursor: 'pointer', width: 20, height: 20, display: 'grid', placeItems: 'center', borderRadius: 'var(--radius-sm)', color: 'var(--ink-faint)' };
const field = { width: '100%', boxSizing: 'border-box', padding: '5px 8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--hairline)', background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 'var(--text-sm)', fontFamily: 'inherit' };

const STATUS_COLOR = { done: 'var(--ps-green)', running: 'var(--ps-blue)', waiting: 'var(--ps-pink)', failed: 'var(--ps-red)', pending: 'var(--hairline)' };

function stepState(run, index, step) {
  if (!run) return 'pending';
  if (run.outputs?.[step.id] || (step.kind === 'review' && index < run.current)) return 'done';
  if (index !== run.current) return 'pending';
  if (run.status === 'running') return 'running';
  if (run.status === 'awaiting_review') return 'waiting';
  if (run.status === 'failed' || run.status === 'stopped') return 'failed';
  return 'pending';
}

export function WorkflowWindow({ win, onUpdate }) {
  const [editing, setEditing] = React.useState(false);
  const [expanded, setExpanded] = React.useState({});
  const { run, steps, interrupted, start, approve, reject, retry, reset } = useWorkflowRun(win, onUpdate);
  const title = win.title || DEFAULT_WORKFLOW.title;
  const agents = getAgents();
  const busy = run?.status === 'running' && !interrupted;

  const setSteps = (next) => onUpdate?.({ steps: next, run: null });
  const patchStep = (id, patch) => setSteps(steps.map(s => (s.id === id ? { ...s, ...patch } : s)));
  const addStep = (kind) => setSteps([...steps, kind === 'review'
    ? { id: newStepId(), kind: 'review', title: 'Review' }
    : { id: newStepId(), kind: 'agent', agentId: agents[0]?.id || 'censai', title: 'New step', instructions: '' }]);

  const statusLine = !run ? `${steps.length} steps`
    : interrupted ? 'interrupted'
      : run.status === 'awaiting_review' ? 'waiting for review'
        : run.status.replace('_', ' ');

  return (
    <>
      <WindowTitle icon={<Icon.NewWorkflow size={14} />} label={title} subtitle={statusLine} attachedAgentIds={win.attachedAgents} onDetach={(id) => onUpdate?.({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })}>
        <button type="button" onClick={() => setEditing(e => !e)} disabled={busy} style={btn}>{editing ? 'Done' : 'Edit'}</button>
        {!editing && (!run || ['complete', 'stopped'].includes(run.status)) && (
          <button type="button" onClick={start} disabled={steps.length === 0} style={primaryBtn}>{run ? 'Run again' : 'Run'}</button>
        )}
      </WindowTitle>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, background: 'var(--surface)', color: 'var(--ink)' }}>
        {editing && (
          <input aria-label="Workflow name" value={title} onChange={(e) => onUpdate?.({ title: e.target.value })} style={{ ...field, fontWeight: 600, marginBottom: 12 }} />
        )}
        {steps.map((step, index) => {
          const state = stepState(run, index, step);
          const agent = step.kind === 'agent' ? getAgentById(step.agentId) : null;
          const output = run?.outputs?.[step.id];
          return (
            <React.Fragment key={step.id}>
              {index > 0 && <div style={{ width: 2, height: 14, background: 'var(--hairline)', marginLeft: 22 }} />}
              <div data-step-state={state} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 'var(--radius-lg)', background: 'var(--surface-2)', border: `1px solid ${state === 'pending' ? 'var(--hairline)' : STATUS_COLOR[state]}` }}>
                <div style={{ flexShrink: 0, marginTop: 2 }}>
                  {step.kind === 'review'
                    ? <div style={{ width: 24, height: 24, borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center', background: 'var(--ps-pink)', color: 'var(--on-fill)' }}><Icon.Eye size={12} /></div>
                    : <AgentAvatar agent={agent} size={24} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editing ? (
                    <div style={{ display: 'grid', gap: 6 }}>
                      <input aria-label="Step name" value={step.title} onChange={(e) => patchStep(step.id, { title: e.target.value })} style={field} />
                      {step.kind === 'agent' && (
                        <>
                          <select aria-label="Agent" value={step.agentId} onChange={(e) => patchStep(step.id, { agentId: e.target.value })} style={field}>
                            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                          <textarea aria-label="Instructions" value={step.instructions || ''} onChange={(e) => patchStep(step.id, { instructions: e.target.value })} rows={2} placeholder="What should this agent do?" style={{ ...field, resize: 'vertical' }} />
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{step.title}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>
                        {step.kind === 'review' ? 'Human review: the run pauses here until approved' : `${agent?.name || step.agentId} · ${step.instructions || 'no instructions'}`}
                      </div>
                      {state === 'running' && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ps-blue)', marginTop: 6 }}>Working…</div>}
                      {state === 'waiting' && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                          <button type="button" onClick={approve} style={primaryBtn}>Approve</button>
                          <button type="button" onClick={reject} style={btn}>Stop</button>
                        </div>
                      )}
                      {state === 'failed' && run?.error && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ps-red)', marginTop: 6 }}>
                          {run.error}{' '}
                          {run.status === 'failed' && <button type="button" onClick={retry} style={{ ...btn, marginLeft: 6 }}>Retry</button>}
                        </div>
                      )}
                      {output && (
                        <div style={{ marginTop: 8 }}>
                          <button type="button" onClick={() => setExpanded(x => ({ ...x, [step.id]: !x[step.id] }))} style={{ ...btn, padding: '2px 8px' }}>
                            {expanded[step.id] ? 'Hide output' : 'Show output'}
                          </button>
                          {expanded[step.id] && <div style={{ marginTop: 6, fontSize: 'var(--text-xs)', lineHeight: 1.5, whiteSpace: 'pre-wrap', padding: 8, borderRadius: 'var(--radius-md)', background: 'var(--surface)', border: '1px solid var(--hairline)', maxHeight: 220, overflow: 'auto' }}>{output}</div>}
                        </div>
                      )}
                    </>
                  )}
                </div>
                {editing && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button type="button" aria-label="Move up" onClick={() => setSteps(moveStep(steps, index, -1))} style={iconBtn}><Icon.Up size={11} /></button>
                    <button type="button" aria-label="Move down" onClick={() => setSteps(moveStep(steps, index, 1))} style={iconBtn}><Icon.Down size={11} /></button>
                    <button type="button" aria-label="Remove step" onClick={() => setSteps(steps.filter(s => s.id !== step.id))} style={iconBtn}><Icon.Close size={10} /></button>
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
        {editing && (
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <button type="button" onClick={() => addStep('agent')} style={btn}>+ Agent step</button>
            <button type="button" onClick={() => addStep('review')} style={btn}>+ Review step</button>
          </div>
        )}
        {!editing && interrupted && (
          <div style={{ marginTop: 12, fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>
            This run was interrupted.{' '}
            <button type="button" onClick={retry} style={btn}>Resume</button>{' '}
            <button type="button" onClick={reset} style={btn}>Clear</button>
          </div>
        )}
        {!editing && run?.status === 'complete' && (
          <div style={{ marginTop: 12, fontSize: 'var(--text-xs)', color: 'var(--ps-green)' }}>Finished {new Date(run.finishedAt).toLocaleString()}.</div>
        )}
      </div>
    </>
  );
}
