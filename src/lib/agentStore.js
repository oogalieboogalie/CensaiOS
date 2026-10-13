import { api } from './api.js';
import { FAMILY_AGENTS as BUILT_IN_AGENTS } from '../data/family-agents.js';

let agents = [...BUILT_IN_AGENTS];
let byId = Object.fromEntries(agents.map(a => [a.id, a]));
let listeners = new Set();

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
    console.error('Failed to initialize agents in store:', err);
  }
}

export function addAgent(agent) {
  if (!byId[agent.id]) {
    agents = [...agents, agent];
    byId[agent.id] = agent;
    notify();
  }
}

export function updateAgent(agent) {
  if (byId[agent.id]) {
    const existing = byId[agent.id];
    const updated = {
      ...existing,
      ...agent,
      system_prompt: agent.system_prompt ?? agent.systemPrompt ?? existing.system_prompt,
      systemPrompt: agent.system_prompt ?? agent.systemPrompt ?? existing.systemPrompt,
    };
    agents = agents.map(a => a.id === agent.id ? updated : a);
    byId[agent.id] = updated;
    notify();
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
