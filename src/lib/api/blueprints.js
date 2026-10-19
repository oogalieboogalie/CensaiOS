// Blueprints (server/routes/agents/blueprints.js): the board's shelf of
// named recipes with IDs, and its "Do we have ..." phrases.
import { configurationWorkspaceQuery, readConfigurationResponse } from './agentConfiguration.js';

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const read = async (request) => readConfigurationResponse(await request, 'Blueprint request failed');

export function getBlueprints(workspaceId) {
  return read(fetch(`/api/blueprints?${configurationWorkspaceQuery(workspaceId)}`));
}

export function askBlueprints(workspaceId, question) {
  return read(fetch(`/api/blueprints?${configurationWorkspaceQuery(workspaceId)}&q=${encodeURIComponent(question)}`));
}

export function saveBlueprint(workspaceId, blueprint) {
  return read(fetch('/api/blueprints', json('POST', { workspaceId, blueprint })));
}

export function deleteBlueprint(workspaceId, id) {
  return read(fetch(`/api/blueprints/${encodeURIComponent(id)}?${configurationWorkspaceQuery(workspaceId)}`, { method: 'DELETE' }));
}

export function getBlueprintPhrases(workspaceId) {
  return read(fetch(`/api/blueprints/phrases?${configurationWorkspaceQuery(workspaceId)}`));
}

export function saveBlueprintPhrases(workspaceId, phrases) {
  return read(fetch('/api/blueprints/phrases', json('PUT', { workspaceId, phrases })));
}
