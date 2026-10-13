// Outside tools: MCP servers a person adds so their agents can use them.
import { shareRequest } from '../api/shareLinks.js';

const base = '/api/outside-tools';
const one = (id) => `${base}/${encodeURIComponent(id)}`;
const withAgent = (path, agentId) => `${path}?agentId=${encodeURIComponent(agentId || '')}`;

export const outsideToolsApi = {
  list: (agentId) => shareRequest(withAgent(base, agentId)),
  add: (agentId, input) => shareRequest(withAgent(base, agentId), { method: 'POST', body: input }),
  check: (agentId, id) => shareRequest(withAgent(`${one(id)}/check`, agentId), { method: 'POST' }),
  setEnabled: (agentId, id, enabled) => shareRequest(withAgent(one(id), agentId), { method: 'PATCH', body: { enabled } }),
  setKey: (agentId, id, key) => shareRequest(withAgent(`${one(id)}/key`, agentId), { method: 'PUT', body: { key } }),
  setAllowed: (agentId, id, allowed) => shareRequest(
    withAgent(`${one(id)}/agents/${encodeURIComponent(agentId)}`, agentId), { method: 'PUT', body: { allowed } },
  ),
  remove: (agentId, id) => shareRequest(withAgent(one(id), agentId), { method: 'DELETE' }),
};
