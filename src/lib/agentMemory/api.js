// Agent memory: who an agent is, what it knows (with dates), what it has talked about.
import { shareRequest } from '../api/shareLinks.js';

const base = '/api/agent-memory';
const at = (path, agentId, extra = '') => `${base}${path}?agentId=${encodeURIComponent(agentId || '')}${extra}`;

export const agentMemoryApi = {
  load: (agentId) => shareRequest(at('', agentId)),
  searchEpisodes: (agentId, q) => shareRequest(at('/episodes', agentId, `&q=${encodeURIComponent(q || '')}`)),
  setIdentity: (agentId, core) => shareRequest(at('/identity', agentId), { method: 'PUT', body: { core } }),
  saveFact: (agentId, fact) => shareRequest(at('/facts', agentId), { method: 'POST', body: fact }),
  forgetFact: (agentId, id) => shareRequest(at(`/facts/${encodeURIComponent(id)}`, agentId), { method: 'DELETE' }),
};
