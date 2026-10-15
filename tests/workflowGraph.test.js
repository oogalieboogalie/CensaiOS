import {
  WORKFLOW_TOOLS, branchWay, canConnect, graphFromSteps, graphProblem, nodeInput, nodeReached, runOrder, starterGraph, workflowGraph,
} from '../src/lib/workflow/graph.js';

const n = (id, type, extra = {}) => ({ id, type, x: 0, y: 0, title: id, ...extra });

describe('workflow graphs', () => {
  test('a new window starts with Start, one agent and a result card, ready to run', () => {
    const graph = workflowGraph({});
    expect(graph.nodes.map((node) => node.type)).toEqual(['trigger', 'agent', 'output']);
    expect(graphProblem(graph)).toBeNull();
    expect(workflowGraph({ graph: starterGraph() }).edges).toHaveLength(2);
  });

  test('older step lists become a chain from Start to a result card', () => {
    const graph = graphFromSteps([{ id: 'a', kind: 'agent', agentId: 'censai', title: 'A' }, { id: 'r', kind: 'review', title: 'R' }]);
    expect(runOrder(graph).map((node) => node.id)).toEqual(['start', 'a', 'r', 'result']);
    expect(graph.nodes.find((node) => node.id === 'r').type).toBe('review');
  });

  test('lines cannot loop back, double up, join a step to itself or run into Start', () => {
    const graph = { nodes: [n('s', 'trigger'), n('a', 'agent', { agentId: 'x' }), n('b', 'agent', { agentId: 'x' })], edges: [{ id: '1', from: 's', to: 'a' }, { id: '2', from: 'a', to: 'b' }] };
    expect(canConnect(graph, 'b', 'a')).toBe(false);
    expect(canConnect(graph, 'a', 'b')).toBe(false);
    expect(canConnect(graph, 'a', 'a')).toBe(false);
    expect(canConnect(graph, 'a', 's')).toBe(false);
    expect(canConnect(graph, 's', 'b')).toBe(true);
  });

  test('problems are named in plain words', () => {
    expect(graphProblem({ nodes: [] })).toMatch(/empty/);
    expect(graphProblem({ nodes: [n('a', 'agent', { agentId: 'x' })], edges: [] })).toMatch(/one Start/);
    expect(graphProblem({ nodes: [n('s', 'trigger'), n('t', 'tool', { tool: 'rm_rf' })], edges: [] })).toMatch(/Pick a tool/);
    const loop = { nodes: [n('s', 'trigger'), n('a', 'agent', { agentId: 'x' }), n('b', 'agent', { agentId: 'x' })], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }] };
    expect(graphProblem(loop)).toMatch(/loops back/);
  });

  test('a check sends text down yes or no', () => {
    expect(branchWay({ test: 'contains', value: 'HOT' }, 'this lead is hot')).toBe('yes');
    expect(branchWay({ test: 'contains', value: 'hot' }, 'cold')).toBe('no');
    expect(branchWay({ test: 'not_contains', value: 'hot' }, 'cold')).toBe('yes');
    expect(branchWay({ test: 'longer_than', value: '3' }, 'abcd')).toBe('yes');
  });

  test('only the way a check went carries work on', () => {
    const graph = {
      nodes: [n('c', 'branch'), n('y', 'agent'), n('no', 'agent')],
      edges: [{ id: '1', from: 'c', to: 'y', port: 'yes' }, { id: '2', from: 'c', to: 'no', port: 'no' }],
    };
    const results = { c: { status: 'done', output: 'hot lead', way: 'yes' } };
    expect(nodeReached(graph, 'y', results)).toBe(true);
    expect(nodeReached(graph, 'no', results)).toBe(false);
    expect(nodeInput(graph, 'y', results)).toBe('hot lead');
  });

  test('a step fed by two others gets both results', () => {
    const graph = { nodes: [n('a', 'agent'), n('b', 'agent'), n('m', 'agent')], edges: [{ from: 'a', to: 'm' }, { from: 'b', to: 'm' }] };
    expect(nodeInput(graph, 'm', { a: { status: 'done', output: 'one' }, b: { status: 'done', output: 'two' } })).toBe('one\n\n---\n\ntwo');
  });

  test('tool steps only offer look-up tools and turn text into arguments', () => {
    expect(Object.keys(WORKFLOW_TOOLS)).toEqual(['web_search', 'recall', 'query_knowledge', 'project_list']);
    expect(WORKFLOW_TOOLS.web_search.equip).toBe('Web Research');
    expect(WORKFLOW_TOOLS.web_search.args('open houses').query).toBe('open houses');
  });
});
