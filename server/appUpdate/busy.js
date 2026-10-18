/**
 * Agents working right now, so an update never cuts one off mid-task.
 *
 * runAgentTurn (server/runEngine) checks every chat, help, endpoint and
 * workflow turn in and out here. Legions and workflow runs keep their own
 * lists; busyAgents() reads those too (loaded on demand, no import cycle).
 */

const turns = new Map();
let nextId = 0;

/** Mark an agent turn as started; call what it returns when it ends. */
export function agentTurnStarted({ agentId = null, origin = 'chat' } = {}) {
  const id = ++nextId;
  turns.set(id, { agentId, origin, since: Date.now() });
  return () => { turns.delete(id); };
}

async function agentName(agentId, lookup) {
  if (!agentId) return 'An agent';
  try {
    const agent = await lookup(agentId);
    return agent?.name || 'An agent';
  } catch {
    return 'An agent';
  }
}

async function defaultLookup(agentId) {
  const { getAgent } = await import('../memory/core/agents.js');
  return getAgent(agentId);
}

async function otherWork() {
  const out = [];
  try {
    const { runningLegions } = await import('../legion/runs.js');
    for (const run of runningLegions()) out.push({ name: 'A Legion', what: String(run.goal || '').slice(0, 80) });
  } catch { /* Legion not loaded in this copy */ }
  try {
    const { activeRuns } = await import('../workflows/runner.js');
    for (const run of activeRuns()) out.push({ name: run.title || 'A workflow', what: 'running a workflow' });
  } catch { /* workflows not loaded in this copy */ }
  return out;
}

/** [{ name, what }] for everything mid-task in this server. Never throws. */
export async function busyAgents({ lookup = defaultLookup, others = otherWork } = {}) {
  const seen = new Map();
  for (const turn of turns.values()) {
    // A workflow's own turns are already listed once as the workflow.
    if (turn.origin === 'workflow') continue;
    const key = turn.agentId || `anon-${turn.since}`;
    if (!seen.has(key)) seen.set(key, turn);
  }
  const list = await Promise.all([...seen.values()].map(async (turn) => ({
    name: await agentName(turn.agentId, lookup),
    what: turn.origin === 'chat' ? 'answering in chat' : `working (${turn.origin})`,
  })));
  return [...list, ...(await others().catch(() => []))];
}

export function resetBusyAgents() {
  turns.clear();
}
