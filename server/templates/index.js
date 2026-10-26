// Spec 7: board templates. A template is a ready-made board (groups,
// windows, agents and F-key bindings) a team opens and uses on day one:
// Developer, Code Workspace, Creative Studio, Agent Team, Small Business,
// Notes Workspace and Real Estate Team.

import { createSubAgent } from '../memory.js';
import { REAL_ESTATE_AGENTS } from './realEstate/agents.js';
import { buildRealEstateBoard, REAL_ESTATE_TEMPLATE_ID } from './realEstate/board.js';
import { loadRealEstateModules } from './realEstate/modules.js';
import { buildDeveloperBoard, DEVELOPER_AGENTS, DEVELOPER_TEMPLATE } from './starters/developer.js';
import { buildCreativeBoard, CREATIVE_AGENTS, CREATIVE_TEMPLATE } from './starters/creative.js';
import { buildSmallBusinessBoard, SMALL_BUSINESS_AGENTS, SMALL_BUSINESS_TEMPLATE } from './starters/smallBusiness.js';
import { buildCodeWorkspaceBoard, CODE_WORKSPACE_AGENTS, CODE_WORKSPACE_TEMPLATE } from './starters/codeWorkspace.js';
import { AGENT_TEAM_AGENTS, AGENT_TEAM_TEMPLATE, buildAgentTeamBoard } from './starters/agentTeam.js';
import { NOTES_WORKSPACE_AGENTS, NOTES_WORKSPACE_TEMPLATE, buildNotesWorkspaceBoard } from './starters/notesWorkspace.js';

// Template agents hang off the default chat agent, like any workspace sub-agent.
export const TEMPLATE_AGENT_PARENT = 'censai';
export const DEFAULT_OLLAMA_MODEL = 'llama3.1';

const REAL_ESTATE_TEMPLATE = Object.freeze({
  id: REAL_ESTATE_TEMPLATE_ID,
  name: 'Real Estate Team',
  description: 'Listings, deals, marketing and team chat on one board, with four AI teammates that draft while people approve.',
  groups: ['Listings', 'Active Deals', 'Marketing', 'Team Chat'],
  agents: REAL_ESTATE_AGENTS.map(agent => agent.name),
  groupContents: {
    Listings: 'Listing Writer, draft, agent chat',
    'Active Deals': 'Deal pipeline, showings, commission, coordinator',
    Marketing: 'CMA sheet, analyst, open house sign-in',
    'Team Chat': 'Team chat, Outbox, follow-ups',
  },
  modules: ['Deal pipeline', 'Showing schedule', 'Open house sign-in', 'Commission calculator', 'CMA sheet'],
});

// Starters people are most likely to want first come first.
export const BOARD_TEMPLATES = Object.freeze([
  DEVELOPER_TEMPLATE, CODE_WORKSPACE_TEMPLATE, CREATIVE_TEMPLATE, AGENT_TEAM_TEMPLATE, SMALL_BUSINESS_TEMPLATE, NOTES_WORKSPACE_TEMPLATE, REAL_ESTATE_TEMPLATE,
]);

// How each template makes its agents and its board.
const BUILDERS = {
  [REAL_ESTATE_TEMPLATE_ID]: {
    agents: REAL_ESTATE_AGENTS,
    build: async (agents, { loadModules }) => buildRealEstateBoard({ agents, modules: await loadModules() }),
  },
  [DEVELOPER_TEMPLATE.id]: { agents: DEVELOPER_AGENTS, build: async (agents) => buildDeveloperBoard({ agents }) },
  [CREATIVE_TEMPLATE.id]: { agents: CREATIVE_AGENTS, build: async (agents) => buildCreativeBoard({ agents }) },
  [CODE_WORKSPACE_TEMPLATE.id]: { agents: CODE_WORKSPACE_AGENTS, build: async (agents) => buildCodeWorkspaceBoard({ agents }) },
  [AGENT_TEAM_TEMPLATE.id]: { agents: AGENT_TEAM_AGENTS, build: async (agents) => buildAgentTeamBoard({ agents }) },
  [SMALL_BUSINESS_TEMPLATE.id]: { agents: SMALL_BUSINESS_AGENTS, build: async (agents) => buildSmallBusinessBoard({ agents }) },
  [NOTES_WORKSPACE_TEMPLATE.id]: { agents: NOTES_WORKSPACE_AGENTS, build: async (agents) => buildNotesWorkspaceBoard({ agents }) },
};

export function findBoardTemplate(id) {
  return BOARD_TEMPLATES.find(template => template.id === id) || null;
}

/** Which model the template's agents answer with: the board default, or a local Ollama model. */
export function templateModelChoice(input = {}) {
  if (input?.models === 'ollama') {
    const name = String(input.ollamaModel || '').trim().slice(0, 80) || DEFAULT_OLLAMA_MODEL;
    return { modelProvider: 'ollama', modelName: name };
  }
  return { modelProvider: null, modelName: null };
}

/** The client-side agent record (agentStore / extraAgents) for a created sub-agent. */
export function clientAgentRecord(def, sub) {
  return {
    id: sub.id,
    name: def.name,
    role: def.role,
    description: def.description,
    starters: def.starters,
    glyph: def.glyph,
    hue: def.hue,
    kind: 'ai',
    subAgent: true,
    templateAgent: def.key,
    model_provider: sub.model_provider || null,
    model_name: sub.model_name || null,
  };
}

/**
 * Create the template's agents in the workspace (idempotent: the same names
 * on the same board update in place) and build the board snapshot.
 */
export async function applyBoardTemplate(id, { scope, input = {}, createAgent = createSubAgent, loadModules = loadRealEstateModules } = {}) {
  const builder = BUILDERS[id];
  if (!findBoardTemplate(id) || !builder) {
    throw Object.assign(new Error('That template does not exist.'), { statusCode: 404, code: 'TEMPLATE_NOT_FOUND' });
  }
  const model = templateModelChoice(input);
  const created = [];
  for (const def of builder.agents) {
    const sub = await createAgent(TEMPLATE_AGENT_PARENT, {
      name: def.name,
      role: def.role,
      specialty: def.description,
      systemPrompt: def.prompt,
      hue: def.hue,
      permission: 'worker',
      modelProvider: model.modelProvider,
      modelName: model.modelName,
      toolScopes: { mode: 'custom', tools: def.tools },
    }, scope);
    created.push({ def, sub });
  }
  const agentIds = Object.fromEntries(created.map(({ def, sub }) => [def.key, sub.id]));
  const board = await builder.build(agentIds, { loadModules });
  return {
    ...board,
    agents: created.map(({ def, sub }) => clientAgentRecord(def, sub)),
    model,
  };
}
