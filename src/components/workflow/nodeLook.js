// How each kind of workflow step looks and reads on the node canvas.
import { BRANCH_TESTS, WORKFLOW_TOOLS } from '../../lib/workflow/graph.js';
import { describeEvery } from '../../lib/schedule/plainWords.js';

export const NODE_W = 188;
export const NODE_H = 76;

export const NODE_LOOK = Object.freeze({
  trigger: { icon: 'Play', label: 'Start' },
  agent: { icon: 'Bot', label: 'Agent' },
  tool: { icon: 'Tools', label: 'Tool' },
  branch: { icon: 'Branch', label: 'Check' },
  review: { icon: 'Eye', label: 'Review' },
  output: { icon: 'Files', label: 'Result card' },
});

/** Kinds a board-event Start can watch for, in plain words. */
export const WATCHABLE_KINDS = Object.freeze([
  ['doc', 'a document'], ['idea', 'an idea'], ['todos', 'a to-do list'], ['chat', 'an agent chat'],
  ['image', 'a picture'], ['browser', 'a browser window'], ['leadHound', 'a LeadHound search'],
]);

export function triggerLine(node, armed) {
  const mode = armed?.mode && armed.mode !== 'manual' ? armed : null;
  if (mode?.mode === 'schedule') return `${describeEvery(mode.everyMinutes)}, on its own`;
  if (mode?.mode === 'board') {
    const kind = WATCHABLE_KINDS.find(([id]) => id === mode.windowKind)?.[1] || mode.windowKind;
    return `When ${kind} lands on the board`;
  }
  return node.input ? `Run starts with: ${node.input}` : 'You press Run';
}

/** One plain line under a node's title saying what it does. */
export function nodeLine(node, { agentName, armed } = {}) {
  switch (node.type) {
    case 'trigger': return triggerLine(node, armed);
    case 'agent': return `${agentName || node.agentId}${node.instructions ? `: ${node.instructions}` : ''}`;
    case 'tool': return WORKFLOW_TOOLS[node.tool]?.label || 'Pick a tool';
    case 'branch': return `Text ${BRANCH_TESTS[node.test] || 'contains'} "${node.value || '…'}"`;
    case 'review': return 'Waits for a teammate to approve';
    case 'output': return 'Puts the result on the board';
    default: return '';
  }
}

/** The status line a node shows during and after a run. */
export function statusLine(result) {
  if (!result) return null;
  if (result.status === 'running') return 'Working…';
  if (result.status === 'waiting') return 'Waiting for review';
  if (result.status === 'skipped') return 'Skipped';
  if (result.status === 'failed') return result.error || 'Failed';
  if (result.status === 'done') {
    const time = Number.isFinite(result.ms) && result.ms > 0 ? ` in ${(result.ms / 1000).toFixed(1)}s` : '';
    return `${result.way ? `Went ${result.way}` : 'Done'}${time}`;
  }
  return null;
}

// Ports sit a fixed distance from a step's top (workflow.css), so lines stay
// put while a step grows to show its status and output.
export const PORT_Y = { in: 38, out: 38, yes: 30, no: 56 };

/** Where a node's ports sit, in workflow-canvas coordinates. */
export function portSpot(node, side, port = null) {
  if (side === 'in') return { x: node.x, y: node.y + PORT_Y.in };
  return { x: node.x + NODE_W, y: node.y + PORT_Y[port || 'out'] };
}

/** A view that shows every step, never zoomed in past life size. */
export function fitView(nodes, width, height, pad = 24) {
  if (!nodes.length) return { x: 0, y: 0, k: 1 };
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxX = Math.max(...nodes.map((n) => n.x + NODE_W));
  const maxY = Math.max(...nodes.map((n) => n.y + NODE_H + 40));
  const k = Math.max(0.35, Math.min(1, (width - pad * 2) / (maxX - minX), (height - pad * 2) / (maxY - minY)));
  return { k, x: pad - minX * k, y: pad - minY * k };
}

/** A soft S-curve between two ports. */
export function wirePath(a, b) {
  const bend = Math.max(40, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + bend} ${a.y}, ${b.x - bend} ${b.y}, ${b.x} ${b.y}`;
}
