// Pure data helpers for the Workflow window: the step list lives on the
// window object, so it persists and syncs with the rest of the canvas.

let counter = 0;
export function newStepId() {
  counter += 1;
  return `step_${Date.now().toString(36)}_${counter}`;
}

export const DEFAULT_WORKFLOW = Object.freeze({
  title: 'Weekly newsletter',
  steps: [
    { id: 'draft', kind: 'agent', agentId: 'censai', title: 'Draft sections', instructions: 'Write an outline for this week\'s newsletter: three short sections with a headline each.' },
    { id: 'review', kind: 'review', title: 'Review the draft' },
    { id: 'layout', kind: 'agent', agentId: 'genesis', title: 'Layout pass', instructions: 'Turn the approved outline into final newsletter copy with a subject line.' },
    { id: 'distribute', kind: 'agent', agentId: 'echo', title: 'Distribution', instructions: 'Write three social posts that promote this newsletter.' },
  ],
});

export function workflowSteps(win) {
  return Array.isArray(win?.steps) ? win.steps : DEFAULT_WORKFLOW.steps;
}

export function moveStep(steps, index, delta) {
  const next = [...steps];
  const target = index + delta;
  if (target < 0 || target >= next.length) return steps;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * The prompt an agent step receives: its own instructions plus the output of
 * the step before it, so each step builds on the last.
 */
export function stepPrompt({ workflowTitle, step, previousOutput }) {
  const parts = [`You are one step in the workflow "${workflowTitle}".`, `Your step: ${step.title}.`];
  if (step.instructions) parts.push(step.instructions);
  if (previousOutput) parts.push(`Output from the previous step:\n\n${previousOutput}`);
  return parts.join('\n\n');
}

/** Index of the last completed agent output before `index`, or ''. */
export function previousOutput(steps, outputs, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    const out = outputs?.[steps[i].id];
    if (out) return out;
  }
  return '';
}
