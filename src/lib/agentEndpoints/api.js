// Agent endpoints: the owner's side (share an agent, keys, call log).
import { shareRequest } from '../api/shareLinks.js';

const base = '/api/agent-endpoints';
const one = (id) => `${base}/${encodeURIComponent(id)}`;

export const agentEndpointsApi = {
  open: (input) => shareRequest(base, { method: 'POST', body: input }),
  get: (id) => shareRequest(one(id)),
  setEnabled: (id, enabled) => shareRequest(one(id), { method: 'PATCH', body: { enabled } }),
  createKey: (id, label) => shareRequest(`${one(id)}/keys`, { method: 'POST', body: { label } }),
  revokeKey: (id, keyId) => shareRequest(`${one(id)}/keys/${encodeURIComponent(keyId)}`, { method: 'DELETE' }),
};
