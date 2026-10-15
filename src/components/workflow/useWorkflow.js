import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';
import { canConnect, graphProblem, makeNode, workflowGraph } from '../../lib/workflow/graph.js';
import {
  answerWorkflowReview, getWorkflowTrigger, runWorkflow, saveWorkflowTrigger, stopWorkflow,
} from '../../lib/api/workflows.js';

/**
 * Everything the Workflow window does: the graph lives on the window (so it
 * saves with the board and teammates see each edit live), runs happen on the
 * server, and the server writes each step's status back into `win.run`.
 */
export function useWorkflow(win, onUpdate, api = { runWorkflow, answerWorkflowReview, stopWorkflow, getWorkflowTrigger, saveWorkflowTrigger }) {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const graph = React.useMemo(() => workflowGraph(win), [win.graph, win.steps]);
  const run = win.run || null;
  const [error, setError] = React.useState(null);
  const [pending, setPending] = React.useState(false);
  const [armed, setArmed] = React.useState(null);

  const setGraph = React.useCallback((next) => onUpdate?.({ graph: next }), [onUpdate]);

  // Older windows (a plain step list) and new ones save their graph on first touch.
  React.useEffect(() => {
    if (!win.graph) onUpdate?.({ graph });
  }, []);

  React.useEffect(() => {
    if (!workspaceId || !win.id) return undefined;
    let live = true;
    api.getWorkflowTrigger(workspaceId, win.id).then((res) => { if (live) setArmed(res.trigger); }).catch(() => {});
    return () => { live = false; };
  }, [workspaceId, win.id]);

  const call = async (work) => {
    if (!workspaceId) { setError('Open a board first.'); return null; }
    setError(null);
    setPending(true);
    try {
      return await work();
    } catch (err) {
      setError(err.message || 'That did not work.');
      return null;
    } finally {
      setPending(false);
    }
  };

  const patchNode = (id, patch) => setGraph({ ...graph, nodes: graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
  const moveNode = (id, x, y) => patchNode(id, { x: Math.round(x), y: Math.round(y) });
  const addNode = (type, spot) => {
    const node = makeNode(type, spot);
    setGraph({ ...graph, nodes: [...graph.nodes, node] });
    return node.id;
  };
  const removeNode = (id) => setGraph({
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: graph.edges.filter((e) => e.from !== id && e.to !== id),
  });
  const connect = (from, to, port = null) => {
    if (!canConnect(graph, from, to)) return false;
    // A branch sends each way down one line; redrawing a way replaces it.
    const edges = port ? graph.edges.filter((e) => !(e.from === from && e.port === port)) : graph.edges;
    setGraph({ ...graph, edges: [...edges, { id: `e_${from}_${to}_${Date.now().toString(36)}`, from, to, ...(port ? { port } : {}) }] });
    return true;
  };
  const removeEdge = (id) => setGraph({ ...graph, edges: graph.edges.filter((e) => e.id !== id) });

  const busy = run?.status === 'running';
  const start = () => {
    const problem = graphProblem(graph);
    if (problem) { setError(problem); return Promise.resolve(null); }
    return call(() => api.runWorkflow(workspaceId, win.id, graph));
  };
  const stop = () => call(() => api.stopWorkflow(workspaceId, win.id));
  const review = (approve) => call(() => api.answerWorkflowReview(workspaceId, win.id, run?.id, approve));
  const saveTrigger = (trigger) => call(async () => {
    const res = await api.saveWorkflowTrigger(workspaceId, win.id, trigger);
    setArmed(res.trigger);
    return res;
  });

  return {
    graph, run, busy, error, pending, armed, setError,
    patchNode, moveNode, addNode, removeNode, connect, removeEdge,
    start, stop, review, saveTrigger,
  };
}
