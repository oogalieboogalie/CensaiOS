// Agent memory: who an agent is, what it knows (with dates), how things are
// connected (the knowledge graph), and what it has talked about.
import { shareRequest } from '../api/shareLinks.js';

const base = '/api/agent-memory';
const at = (path, agentId, extra = '') => `${base}${path}?agentId=${encodeURIComponent(agentId || '')}${extra}`;

export const agentMemoryApi = {
  load: (agentId) => shareRequest(at('', agentId)),
  searchEpisodes: (agentId, q) => shareRequest(at('/episodes', agentId, `&q=${encodeURIComponent(q || '')}`)),
  conversations: (agentId, q = '') => shareRequest(at('/conversations', agentId, q ? `&q=${encodeURIComponent(q)}` : '')),
  chat: (chatId) => shareRequest(`/api/recents/chats/${encodeURIComponent(chatId)}`),
  recents: (workspaceId, scope = 'board') => shareRequest(`/api/recents?scope=${scope}${workspaceId ? `&workspaceId=${encodeURIComponent(workspaceId)}` : ''}`),
  setIdentity: (agentId, core) => shareRequest(at('/identity', agentId), { method: 'PUT', body: { core } }),
  saveFact: (agentId, fact) => shareRequest(at('/facts', agentId), { method: 'POST', body: fact }),
  forgetFact: (agentId, id) => shareRequest(at(`/facts/${encodeURIComponent(id)}`, agentId), { method: 'DELETE' }),
  asOf: (agentId, date) => shareRequest(at('/as-of', agentId, `&date=${encodeURIComponent(date || '')}`)),
  saveLink: (agentId, link) => shareRequest(at('/relations', agentId), { method: 'POST', body: link }),
  endLink: (agentId, id, ended) => shareRequest(at(`/relations/${encodeURIComponent(id)}/end`, agentId), { method: 'POST', body: { ended } }),
  forgetLink: (agentId, id) => shareRequest(at(`/relations/${encodeURIComponent(id)}`, agentId), { method: 'DELETE' }),
};
