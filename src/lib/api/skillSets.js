// Skill sets (server/routes/agents/skillSets.js): the board's library, the
// research step, the what-worked log, what each agent carries, Idea Foundry.
import { configurationWorkspaceQuery, readConfigurationResponse } from './agentConfiguration.js';

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const read = async (request) => readConfigurationResponse(await request, 'Skill set request failed');

export function getSkillSets(workspaceId) {
  return read(fetch(`/api/skill-sets?${configurationWorkspaceQuery(workspaceId)}`));
}

export function getSkillSet(workspaceId, id) {
  return read(fetch(`/api/skill-sets/${encodeURIComponent(id)}?${configurationWorkspaceQuery(workspaceId)}`));
}

export function saveSkillSet(workspaceId, skillSet) {
  return read(fetch('/api/skill-sets', json('POST', { workspaceId, skillSet })));
}

export function deleteSkillSet(workspaceId, id) {
  return read(fetch(`/api/skill-sets/${encodeURIComponent(id)}?${configurationWorkspaceQuery(workspaceId)}`, { method: 'DELETE' }));
}

export function researchSkillSet(workspaceId, position, model = {}) {
  return read(fetch('/api/skill-sets/research', json('POST', { workspaceId, position, ...model })));
}

export function getSkillSetLog(workspaceId, id) {
  return read(fetch(`/api/skill-sets/${encodeURIComponent(id)}/log?${configurationWorkspaceQuery(workspaceId)}`));
}

export function addSkillSetLog(workspaceId, id, outcome, note) {
  return read(fetch(`/api/skill-sets/${encodeURIComponent(id)}/log`, json('POST', { workspaceId, outcome, note })));
}

export function getAgentSkillSets(agentId, workspaceId) {
  return read(fetch(`/api/agents/${encodeURIComponent(agentId)}/skill-sets?${configurationWorkspaceQuery(workspaceId)}`));
}

export function saveAgentSkillSets(agentId, skillSetIds, workspaceId) {
  return read(fetch(`/api/agents/${encodeURIComponent(agentId)}/skill-sets`, json('PUT', { workspaceId, skillSets: skillSetIds })));
}

export function getIdeaFoundry(workspaceId) {
  return read(fetch(`/api/idea-foundry?${configurationWorkspaceQuery(workspaceId)}`));
}

export function saveIdeaFoundry(workspaceId, settings) {
  return read(fetch('/api/idea-foundry', json('PUT', { workspaceId, ...settings })));
}
