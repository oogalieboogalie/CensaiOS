import React from 'react';
import { sendMessageWithMeta } from '../../lib/chat.js';
import { useWorkspaceStore } from '../../lib/store.js';
import { previousOutput, stepPrompt, workflowSteps } from './workflowModel.js';

/**
 * Runs a workflow's steps in order. Agent steps call the agent through the
 * normal chat API with the previous step's output; review steps pause until
 * someone approves. Run state is stored on the window so it survives reloads.
 */
export function useWorkflowRun(win, onUpdate, { send = sendMessageWithMeta } = {}) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const run = win.run || null;
  const steps = workflowSteps(win);
  const activeRef = React.useRef(false);
  const latest = React.useRef({ win, steps });
  latest.current = { win, steps };

  const update = React.useCallback((patch) => onUpdate?.({ run: { ...(latest.current.win.run || {}), ...patch } }), [onUpdate]);

  const advance = React.useCallback(async (startIndex, outputs) => {
    if (activeRef.current) return;
    activeRef.current = true;
    try {
      const { steps: list, win: current } = latest.current;
      let results = { ...outputs };
      for (let i = startIndex; i < list.length; i += 1) {
        const step = list[i];
        if (step.kind === 'review') {
          update({ status: 'awaiting_review', current: i, outputs: results, error: null });
          return;
        }
        update({ status: 'running', current: i, outputs: results, error: null });
        try {
          const prompt = stepPrompt({ workflowTitle: current.title || 'Workflow', step, previousOutput: previousOutput(list, results, i) });
          const reply = await send(step.agentId, [{ role: 'user', content: prompt }], { workspaceId });
          results = { ...results, [step.id]: String(reply?.text ?? '').trim() || '(no output)' };
        } catch (err) {
          update({ status: 'failed', current: i, outputs: results, error: err?.message || 'Step failed' });
          return;
        }
      }
      update({ status: 'complete', current: list.length, outputs: results, error: null, finishedAt: new Date().toISOString() });
    } finally {
      activeRef.current = false;
    }
  }, [send, update, workspaceId]);

  const start = () => {
    onUpdate?.({ run: { status: 'running', current: 0, outputs: {}, startedAt: new Date().toISOString() } });
    advance(0, {});
  };
  const approve = () => run && advance(run.current + 1, run.outputs || {});
  const reject = () => run && update({ status: 'stopped', error: 'Stopped at review.' });
  const retry = () => run && advance(run.current, run.outputs || {});
  const reset = () => onUpdate?.({ run: null });

  // A run that was mid-step when the page reloaded can't still be in flight.
  const interrupted = run?.status === 'running' && !activeRef.current;

  return { run, steps, interrupted, start, approve, reject, retry, reset };
}
