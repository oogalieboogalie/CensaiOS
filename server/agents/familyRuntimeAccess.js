import { getRuntimeMode, RUNTIME_MODES } from '../middleware/runtimeMode.js';
import { getFamilyBlueprintAgent } from './familyBlueprint.js';

const PRIVILEGED_ROLES = new Set(['admin', 'operator']);

function accessError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}

function exactFamilyAgent(agentId) {
  const id = String(agentId || '').trim();
  const agent = getFamilyBlueprintAgent(id);
  return agent?.id === id ? agent : null;
}

export function requireAgentContextRuntime(isReady) {
  if (!isReady) {
    throw accessError(
      'Agent context is temporarily unavailable.',
      503,
      'AGENT_CONTEXT_UNAVAILABLE',
    );
  }
}

export function requireFamilyAgentIds(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw accessError('At least one family agent is required.', 400, 'FAMILY_AGENT_REQUIRED');
  }
  const ids = values.map((value) => String(value || '').trim());
  if (new Set(ids).size !== ids.length) {
    throw accessError('Family agent ids must be unique.', 400, 'FAMILY_AGENT_DUPLICATE');
  }
  if (ids.some((id) => !exactFamilyAgent(id))) {
    throw accessError('Family agent not found.', 404, 'FAMILY_AGENT_NOT_FOUND');
  }
  return ids;
}

export function requireFamilyRows(ids, rows) {
  const available = new Set((rows || []).map((row) => row.id));
  const missing = ids.filter((id) => !available.has(id));
  if (missing.length) {
    throw accessError('A canonical family agent is temporarily unavailable.', 503, 'FAMILY_AGENT_UNAVAILABLE');
  }
  return rows;
}

export function enforceCoreChatBoundary({
  agentId,
  agent,
  userRole,
  mode = getRuntimeMode(),
}) {
  const familyAgent = exactFamilyAgent(agentId);
  if (familyAgent && !agent) {
    throw accessError('A canonical family agent is temporarily unavailable.', 503, 'FAMILY_AGENT_UNAVAILABLE');
  }
  const role = String(userRole || '').trim().toLowerCase();
  if (agent && !familyAgent && mode === RUNTIME_MODES.CLOUD_SAAS && !PRIVILEGED_ROLES.has(role)) {
    throw accessError('Agent not found.', 404, 'FAMILY_AGENT_NOT_FOUND');
  }
  return familyAgent;
}
