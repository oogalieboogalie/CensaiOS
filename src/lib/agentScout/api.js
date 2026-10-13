// Scout agents: the model an agent's scout runs on, its map of a project,
// and "where do I change X?".
import { shareRequest } from '../api/shareLinks.js';

const base = '/api/agent-scout';
const at = (path, agentId, workspaceId) => `${base}${path}?agentId=${encodeURIComponent(agentId || '')}`
  + `&workspaceId=${encodeURIComponent(workspaceId || '')}`;

export const agentScoutApi = {
  load: (agentId, workspaceId) => shareRequest(at('', agentId, workspaceId)),
  setModel: (agentId, workspaceId, choice) => shareRequest(at('/model', agentId, workspaceId), {
    method: 'PUT', body: choice ? { provider: choice.provider, model: choice.model } : { provider: null, model: null },
  }),
  map: (agentId, workspaceId, body) => shareRequest(at('/map', agentId, workspaceId), { method: 'POST', body }),
  find: (agentId, workspaceId, body) => shareRequest(at('/find', agentId, workspaceId), { method: 'POST', body }),
};
