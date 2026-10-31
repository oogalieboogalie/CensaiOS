import { api } from './api.js';
import { FAMILY_AGENTS as BUILT_IN_AGENTS } from '../data/family-agents.js';
import { logFailure } from './appLog/browserLog.js';

let agents = [...BUILT_IN_AGENTS];
let byId = Object.fromEntries(agents.map(a => [a.id, a]));
let listeners = new Set();
// The server's agent list (initializeAgents) holds only these; any other agent
// was made on a board (the agent designer, a template, an import).
const BUILT_IN_IDS = new Set(BUILT_IN_AGENTS.map(a => a.id));
const madeOnBoard = (id) => Boolean(id) && !BUILT_IN_IDS.has(id);

export function getAgents() { return agents; }
export function getAgentById(id) { return byId[id]; }

export async function initializeAgents() {
  try {
    const dbAgents = await api.getAgents();
    if (Array.isArray(dbAgents) && dbAgents.length > 0) {
      dbAgents.forEach(dbAgent => {
        const existing = byId[dbAgent.id];
        if (existing) {
          const updated = {
            ...existing,
            ...dbAgent,
            // Ensure both formats of prompt are synchronized
            system_prompt: dbAgent.system_prompt ?? dbAgent.systemPrompt ?? existing.system_prompt,
            systemPrompt: dbAgent.system_prompt ?? dbAgent.systemPrompt ?? existing.systemPrompt,
          };
          agents = agents.map(a => a.id === dbAgent.id ? updated : a);
          byId[dbAgent.id] = updated;
        } else if (dbAgent.identity?.betaVisible !== false) {
          const newAgent = {
            ...dbAgent,
            systemPrompt: dbAgent.system_prompt ?? dbAgent.systemPrompt,
          };
          agents = [...agents, newAgent];
          byId[dbAgent.id] = newAgent;
        }
      });
      notify();
    }
  } catch (err) {
    logFailure('agents: could not set up the agent list', err, 'agents', 'error');
  }
}

let refreshing = null;
let refreshAgain = false;
// Each agent made on a board that is being fetched by itself: { again, done }.
const fetching = new Map();

// A fetch under way may answer with an agent from before a change made here meanwhile: fetch once more after it.
const fetchAgainAfter = (id) => {
  if (refreshing) refreshAgain = true;
  const running = fetching.get(id);
  if (running) running.again = true;
};

/** Fetches the agents again (a teammate changed one); a call while a fetch runs makes one more after it. */
export function refreshAgents() {
  if (refreshing) {
    refreshAgain = true;
    return refreshing;
  }
  refreshing = initializeAgents().finally(() => {
    refreshing = null;
    if (refreshAgain) {
      refreshAgain = false;
      refreshAgents();
    }
  });
  return refreshing;
}

/**
 * Fetches an agent made on a board and applies what the server keeps for it,
 * the model its chats answer with included; one this browser does not hold
 * yet (a teammate made it since) is added. A call while it is being fetched,
 * or a change made here meanwhile, drops that answer and fetches once more.
 */
export function refreshAgent(id) {
  if (!madeOnBoard(id)) return Promise.resolve(null);
  const running = fetching.get(id);
  if (running) {
    running.again = true;
    return running.done;
  }
  const entry = { again: false };
  entry.done = new Promise((resolve) => { resolve(api.getAgent(id)); })
    .then((record) => {
      if (entry.again || record?.id !== id) return null;
      put(record);
      return record;
    })
    .catch((err) => {
      logFailure('agents: could not apply an agent', err, 'agents');
      return null;
    })
    .finally(() => {
      fetching.delete(id);
      if (entry.again) refreshAgent(id);
    });
  fetching.set(id, entry);
  return entry.done;
}

/** Fetches again each agent made on a board that this browser holds (or each of `ids`). */
export function refreshBoardAgents(ids = agents.map(a => a.id)) {
  return Promise.all(ids.filter(madeOnBoard).map((id) => refreshAgent(id)));
}

/**
 * Puts in a board's own agents as the board keeps them, then fetches each:
 * a model picked since is kept with the agent on the server, and the
 * board's copy can be older.
 */
export function applyBoardAgents(list = []) {
  const ids = [];
  for (const agent of list) {
    if (!agent?.id) continue;
    if (byId[agent.id]) updateAgent(agent);
    else addAgent(agent);
    ids.push(agent.id);
  }
  return refreshBoardAgents(ids);
}

export function addAgent(agent) {
  if (!byId[agent.id]) {
    agents = [...agents, agent];
    byId[agent.id] = agent;
    notify();
    fetchAgainAfter(agent.id);
  }
}

/** Lays `agent` over what this browser holds for it (or adds it), its prompt's two spellings kept alike. */
function put(agent) {
  const existing = byId[agent.id] || {};
  const next = {
    ...existing,
    ...agent,
    system_prompt: agent.system_prompt ?? agent.systemPrompt ?? existing.system_prompt,
    systemPrompt: agent.system_prompt ?? agent.systemPrompt ?? existing.systemPrompt,
  };
  agents = byId[agent.id] ? agents.map(a => a.id === agent.id ? next : a) : [...agents, next];
  byId[agent.id] = next;
  notify();
}

export function updateAgent(agent) {
  if (byId[agent.id]) {
    put(agent);
    fetchAgainAfter(agent.id);
  }
}

export function updateAgentHue(agentId, hue) {
  const agent = byId[agentId];
  if (agent) {
    agent.hue = hue;
    notify();
  }
}

function notify() {
  listeners.forEach(fn => fn());
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
