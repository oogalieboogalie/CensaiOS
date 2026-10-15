// Workflow graphs: the shape a Workflow window saves on the board, shared by
// the window (drawing and editing) and the server (running). Pure data, no
// React and no I/O, so both sides read a graph the same way.
//
// A graph is { nodes, edges }. Every node has an id, a type, a spot on the
// workflow's own canvas (x, y) and a title. Edges join one node's output to
// another node's input; a branch node's edges also say which way they go
// ("yes" or "no").

export const NODE_TYPES = Object.freeze(['trigger', 'agent', 'tool', 'branch', 'review', 'output']);

export const TRIGGER_MODES = Object.freeze(['manual', 'schedule', 'board']);

/**
 * Tools a tool node can call directly, without a model in between. Only
 * look-up tools: a workflow can run on a schedule with nobody watching.
 * The step uses one agent's tools on this board, so the agent needs the
 * tool (`equip` names the ExoSkeleton module that adds it, when one does).
 * `args` turns the text coming into the node into the tool's arguments.
 */
export const WORKFLOW_TOOLS = Object.freeze({
  web_search: { label: 'Search the web', equip: 'Web Research', args: (text) => ({ query: text.slice(0, 400), max_results: 5 }) },
  recall: { label: 'Search agent memory', args: (text) => ({ query: text.slice(0, 400) }) },
  query_knowledge: { label: 'Look up the knowledge graph', equip: 'Memory Reader', args: (text) => ({ subject: text.slice(0, 120) }) },
  project_list: { label: 'List projects', args: () => ({}) },
});

export const BRANCH_TESTS = Object.freeze({
  contains: 'contains',
  not_contains: 'does not contain',
  longer_than: 'is longer than (characters)',
});

export const MAX_NODES = 40;
export const MAX_OUTPUT_CHARS = 6000;

let counter = 0;
export function newNodeId(type = 'node') {
  counter += 1;
  return `${type}_${Date.now().toString(36)}_${counter}`;
}

const NODE_DEFAULTS = {
  trigger: { title: 'Start', mode: 'manual', everyMinutes: 60, windowKind: 'doc', input: '' },
  agent: { title: 'Agent step', agentId: 'censai', instructions: '' },
  tool: { title: 'Tool', tool: 'web_search', agentId: 'censai' },
  branch: { title: 'Check', test: 'contains', value: '' },
  review: { title: 'Review' },
  output: { title: 'Result card' },
};

/** A new node of a type, with that type's defaults. */
export function makeNode(type, { x = 40, y = 40, ...rest } = {}) {
  return { id: newNodeId(type), type, x, y, ...NODE_DEFAULTS[type], ...rest };
}

/** The graph a brand new Workflow window starts with: Start, one agent, a result card. */
export function starterGraph() {
  return {
    nodes: [
      { id: 'start', type: 'trigger', x: 24, y: 120, ...NODE_DEFAULTS.trigger, input: 'Three ideas for a weekend open house.' },
      { id: 'draft', type: 'agent', x: 250, y: 120, ...NODE_DEFAULTS.agent, title: 'Draft', agentId: 'censai', instructions: 'Write a short plan from this.' },
      { id: 'result', type: 'output', x: 476, y: 120, ...NODE_DEFAULTS.output, title: 'Plan' },
    ],
    edges: [
      { id: 'e_start_draft', from: 'start', to: 'draft' },
      { id: 'e_draft_result', from: 'draft', to: 'result' },
    ],
  };
}

/** Older Workflow windows saved a straight list of steps; draw it as a chain. */
export function graphFromSteps(steps = [], title = 'Workflow') {
  const nodes = [{ id: 'start', type: 'trigger', x: 24, y: 120, ...NODE_DEFAULTS.trigger, title: 'Start' }];
  const edges = [];
  steps.forEach((step, i) => {
    const type = step.kind === 'review' ? 'review' : 'agent';
    nodes.push({ ...NODE_DEFAULTS[type], ...step, kind: undefined, type, x: 250 + i * 226, y: 120 });
  });
  nodes.push({ id: 'result', type: 'output', x: 250 + steps.length * 226, y: 120, title: `${title} result` });
  for (let i = 1; i < nodes.length; i += 1) edges.push({ id: `e_${nodes[i - 1].id}_${nodes[i].id}`, from: nodes[i - 1].id, to: nodes[i].id });
  return { nodes, edges };
}

/** The graph a window holds, whichever way it was saved. */
export function workflowGraph(win) {
  if (win?.graph && Array.isArray(win.graph.nodes)) {
    return { nodes: win.graph.nodes, edges: Array.isArray(win.graph.edges) ? win.graph.edges : [] };
  }
  if (Array.isArray(win?.steps)) return graphFromSteps(win.steps, win.title);
  return starterGraph();
}

export function triggerOf(graph) {
  return graph.nodes.find((node) => node.type === 'trigger') || null;
}

/** Joining a to b is allowed: no self loops, no doubles, nothing into a trigger, no cycles. */
export function canConnect(graph, from, to) {
  if (!from || !to || from === to) return false;
  const target = graph.nodes.find((node) => node.id === to);
  if (!target || target.type === 'trigger') return false;
  if (graph.edges.some((edge) => edge.from === from && edge.to === to)) return false;
  // Would `to` reach back to `from`?
  const seen = new Set();
  const stack = [to];
  while (stack.length) {
    const id = stack.pop();
    if (id === from) return false;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const edge of graph.edges) if (edge.from === id) stack.push(edge.to);
  }
  return true;
}

/** Nodes in run order (each after everything that feeds it). Throws on a cycle. */
export function runOrder(graph) {
  const incoming = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of graph.edges) if (incoming.has(edge.to) && incoming.has(edge.from)) incoming.set(edge.to, incoming.get(edge.to) + 1);
  const ready = graph.nodes.filter((node) => incoming.get(node.id) === 0);
  const order = [];
  while (ready.length) {
    const node = ready.shift();
    order.push(node);
    for (const edge of graph.edges) {
      if (edge.from !== node.id || !incoming.has(edge.to)) continue;
      incoming.set(edge.to, incoming.get(edge.to) - 1);
      if (incoming.get(edge.to) === 0) ready.push(graph.nodes.find((n) => n.id === edge.to));
    }
  }
  if (order.length !== graph.nodes.length) throw new Error('This workflow loops back on itself. Remove a line to fix it.');
  return order;
}

/** What is wrong with a graph before it can run, or null when it is fine. */
export function graphProblem(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !graph.nodes.length) return 'This workflow is empty.';
  if (graph.nodes.length > MAX_NODES) return `A workflow can have up to ${MAX_NODES} steps.`;
  const triggers = graph.nodes.filter((node) => node.type === 'trigger');
  if (triggers.length !== 1) return 'A workflow needs exactly one Start.';
  for (const node of graph.nodes) {
    if (!NODE_TYPES.includes(node.type)) return `Unknown step "${node.title || node.id}".`;
    if (node.type === 'agent' && !node.agentId) return `Pick an agent for "${node.title}".`;
    if (node.type === 'tool' && !WORKFLOW_TOOLS[node.tool]) return `Pick a tool for "${node.title}".`;
  }
  try { runOrder(graph); } catch (error) { return error.message; }
  return null;
}

/** Which way a branch goes for this text: "yes" or "no". */
export function branchWay(node, text) {
  const value = String(node.value ?? '');
  const body = String(text ?? '');
  if (node.test === 'longer_than') return body.length > (Number(value) || 0) ? 'yes' : 'no';
  const hit = value ? body.toLowerCase().includes(value.toLowerCase()) : false;
  if (node.test === 'not_contains') return hit ? 'no' : 'yes';
  return hit ? 'yes' : 'no';
}

/** An edge carries work when its node finished and, after a branch, went this way. */
export function edgeLive(edge, results) {
  const from = results[edge.from];
  if (!from || from.status !== 'done') return false;
  if (from.way && edge.port) return edge.port === from.way;
  return true;
}

/** The text a node starts from: everything its live incoming edges carried. */
export function nodeInput(graph, nodeId, results) {
  const parts = graph.edges
    .filter((edge) => edge.to === nodeId && edgeLive(edge, results))
    .map((edge) => String(results[edge.from].output ?? ''))
    .filter(Boolean);
  return parts.join('\n\n---\n\n');
}

/** A node runs once something live reaches it. */
export function nodeReached(graph, nodeId, results) {
  return graph.edges.some((edge) => edge.to === nodeId && edgeLive(edge, results));
}

export function clip(text, max = MAX_OUTPUT_CHARS) {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
