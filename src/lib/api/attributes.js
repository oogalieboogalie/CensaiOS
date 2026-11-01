import {
  configurationWorkspaceQuery,
  readConfigurationResponse,
} from './agentConfiguration.js';
import { logFailure } from '../appLog/browserLog.js';

/**
 * Fetches all available attribute definitions.
 * @returns {Promise<{attributes: Array}>}
 */
export async function getAttributes() {
  try {
    const res = await fetch('/api/attributes');
    if (!res.ok) throw new Error('Failed to fetch attribute definitions');
    return await res.json();
  } catch (err) {
    logFailure('attributes: could not load attributes', err, 'attributes', 'error');
    return { attributes: [] };
  }
}

/**
 * Fetches equipped attribute IDs for the requested agent ID.
 * @param {string} agentId
 * @returns {Promise<{attributes: Array<string>}>}
 */
export async function getAgentAttributes(agentId, workspaceId) {
  const scope = configurationWorkspaceQuery(workspaceId);
  return readConfigurationResponse(
    await fetch(`/api/agents/${encodeURIComponent(agentId)}/attributes?${scope}`),
    'Failed to fetch agent attributes',
  );
}

/**
 * Saves equipped attributes for the requested agent ID.
 * @param {string} agentId
 * @param {Array<string>} attributeIds
 * @returns {Promise<{ok: boolean}>}
 */
export async function saveAgentAttributes(agentId, attributeIds, workspaceId) {
  return readConfigurationResponse(await fetch(`/api/agents/${encodeURIComponent(agentId)}/attributes`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attributes: attributeIds, workspaceId }),
  }), 'Failed to save agent attributes');
}

/**
 * Sends a template prompt and active attributes list to compile and preview.
 * @param {string} agentId
 * @param {string} template
 * @param {Array<string>} attributeIds
 * @param {string} workspaceId
 * @param {Array<string>} mindsetIds
 * @returns {Promise<{compiled: string, template: string}>}
 */
export async function compilePromptPreview(agentId, template, attributeIds, workspaceId, mindsetIds = []) {
  return readConfigurationResponse(await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/compile-prompt-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template, attributes: attributeIds, mindsets: mindsetIds, workspaceId }),
    },
  ), 'Failed to compile prompt preview');
}
