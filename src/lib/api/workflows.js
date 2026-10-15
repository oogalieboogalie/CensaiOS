// Workflows on a board (server/routes/workflows.js): run, review, stop,
// and the workflow's own start (schedule or board event).
import { shareRequest } from './shareLinks.js';

const flow = (workspaceId, windowId) => `/api/workspaces/${encodeURIComponent(workspaceId)}/workflows/${encodeURIComponent(windowId)}`;

// `graph` is what this browser drew; the server waits briefly for the board to match.
export function runWorkflow(workspaceId, windowId, graph) {
  return shareRequest(`${flow(workspaceId, windowId)}/run`, { method: 'POST', body: { graph } });
}

export function answerWorkflowReview(workspaceId, windowId, runId, approve) {
  return shareRequest(`${flow(workspaceId, windowId)}/review`, { method: 'POST', body: { runId, approve } });
}

export function stopWorkflow(workspaceId, windowId) {
  return shareRequest(`${flow(workspaceId, windowId)}/stop`, { method: 'POST', body: {} });
}

export function getWorkflowTrigger(workspaceId, windowId) {
  return shareRequest(`${flow(workspaceId, windowId)}/trigger`);
}

export function saveWorkflowTrigger(workspaceId, windowId, trigger) {
  return shareRequest(`${flow(workspaceId, windowId)}/trigger`, { method: 'PUT', body: trigger });
}

export function listWorkflowRuns(workspaceId, windowId) {
  return shareRequest(`${flow(workspaceId, windowId)}/runs`);
}
