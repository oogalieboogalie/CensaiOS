// Plain words for a Kraken Request and its arms (the shape
// server/kraken/arms.js publicRequest sends). Pure, no React.

const ARM_WORDS = {
  waiting: 'Waiting its turn', handed: 'With the agent', done: 'Done and checked', stuck: 'Stuck', stopped: 'Stopped',
};
const RANK_WORDS = { P0: 'Broken now', P1: 'Will break', P2: 'Clean-up' };
const REQUEST_WORDS = { open: 'Handing out', done: 'All arms back', stopped: 'Stopped' };

export const armWord = (status) => ARM_WORDS[status] || status;
export const rankWord = (severity) => RANK_WORDS[severity] || severity;
export const requestWord = (status) => REQUEST_WORDS[status] || status;
export const requestIsOpen = (request) => request?.status === 'open';

/** "3 of 8 back, 1 stuck" for a request's header. */
export function progressLine(request) {
  const arms = Array.isArray(request?.arms) ? request.arms : [];
  const back = arms.filter((arm) => arm.status === 'done').length;
  const stuck = arms.filter((arm) => arm.status === 'stuck').length;
  const parts = [`${back} of ${arms.length} back`];
  if (stuck) parts.push(`${stuck} stuck`);
  return parts.join(', ');
}

/** How many arms each agent has, most first: [{ agentId, agent, count }]. */
export function armsByAgent(arms = []) {
  const byId = new Map();
  for (const arm of arms) {
    const entry = byId.get(arm.agentId) || { agentId: arm.agentId, agent: arm.agent, count: 0 };
    entry.count += 1;
    byId.set(arm.agentId, entry);
  }
  return [...byId.values()].sort((a, b) => b.count - a.count);
}
