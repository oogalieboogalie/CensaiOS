// Plain words for a Kraken Request and its arms (the shape
// server/kraken/arms.js publicRequest sends). Pure, no React.

const ARM_WORDS = {
  waiting: 'Waiting its turn', handing: 'Going out', handed: 'With the agent', blocked: 'Blocked',
  done: 'Done and checked', stuck: 'Stuck', stopped: 'Stopped',
};
const RANK_WORDS = { P0: 'Broken now', P1: 'Will break', P2: 'Clean-up' };
const REQUEST_WORDS = { open: 'Handing out', done: 'All arms back', stopped: 'Stopped' };

export const armWord = (status) => ARM_WORDS[status] || status;
export const rankWord = (severity) => RANK_WORDS[severity] || severity;
export const requestWord = (status) => REQUEST_WORDS[status] || status;
export const requestIsOpen = (request) => request?.status === 'open';

/** "3 of 8 back, 1 stuck, 1 blocked" for a request's header. */
export function progressLine(request) {
  const arms = Array.isArray(request?.arms) ? request.arms : [];
  const back = arms.filter((arm) => arm.status === 'done').length;
  const stuck = arms.filter((arm) => arm.status === 'stuck').length;
  const parts = [`${back} of ${arms.length} back`];
  if (stuck) parts.push(`${stuck} stuck`);
  const blocked = arms.filter((arm) => arm.status === 'blocked').length;
  if (blocked) parts.push(`${blocked} blocked`);
  return parts.join(', ');
}

/**
 * Which project the work runs in, from the pin the look came back with
 * (server/censaiOrchestrator/projectPin.js): which project, where its code is, which branch.
 */
export function pinLine(pin) {
  if (!pin?.projectId) return 'No project is pinned: each family member looks in its own project.';
  const where = pin.kind === 'github' ? `${pin.source} on GitHub` : `the folder ${pin.source}`;
  const at = pin.commit ? ` (at ${String(pin.commit).slice(0, 7)})` : '';
  const branch = pin.branch ? `on the branch "${pin.branch}"${at}` : 'branch not known';
  return `Runs in "${pin.name}": ${where}, ${branch}.`;
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
