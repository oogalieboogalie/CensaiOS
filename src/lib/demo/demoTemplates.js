// Ready-made boards on the try-it board. The starters are pure builders, so
// the demo runs the same ones the server does (server/templates/starters),
// with stand-in agent ids instead of saved agents. Real Estate Team reads
// module files from disk on the server, so it stays out of the demo.
import { buildDeveloperBoard, DEVELOPER_AGENTS, DEVELOPER_TEMPLATE } from '../../../server/templates/starters/developer.js';
import { buildCreativeBoard, CREATIVE_AGENTS, CREATIVE_TEMPLATE } from '../../../server/templates/starters/creative.js';
import { buildSmallBusinessBoard, SMALL_BUSINESS_AGENTS, SMALL_BUSINESS_TEMPLATE } from '../../../server/templates/starters/smallBusiness.js';
import { buildCodeWorkspaceBoard, CODE_WORKSPACE_AGENTS, CODE_WORKSPACE_TEMPLATE } from '../../../server/templates/starters/codeWorkspace.js';
import { AGENT_TEAM_AGENTS, AGENT_TEAM_TEMPLATE, buildAgentTeamBoard } from '../../../server/templates/starters/agentTeam.js';

const STARTERS = {
  [DEVELOPER_TEMPLATE.id]: { template: DEVELOPER_TEMPLATE, agents: DEVELOPER_AGENTS, build: buildDeveloperBoard },
  [CODE_WORKSPACE_TEMPLATE.id]: { template: CODE_WORKSPACE_TEMPLATE, agents: CODE_WORKSPACE_AGENTS, build: buildCodeWorkspaceBoard },
  [CREATIVE_TEMPLATE.id]: { template: CREATIVE_TEMPLATE, agents: CREATIVE_AGENTS, build: buildCreativeBoard },
  [AGENT_TEAM_TEMPLATE.id]: { template: AGENT_TEAM_TEMPLATE, agents: AGENT_TEAM_AGENTS, build: buildAgentTeamBoard },
  [SMALL_BUSINESS_TEMPLATE.id]: { template: SMALL_BUSINESS_TEMPLATE, agents: SMALL_BUSINESS_AGENTS, build: buildSmallBusinessBoard },
};

export const DEMO_TEMPLATES = Object.values(STARTERS).map((s) => s.template);

let counter = 0;
const makeId = () => `d${(++counter).toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** The board a starter adds, shaped like the server's apply answer. */
export function demoTemplateBoard(id) {
  const starter = STARTERS[id];
  if (!starter) return null;
  const agents = starter.agents.map((def) => ({
    id: `demo-${def.key}-${makeId()}`,
    name: def.name,
    role: def.role,
    description: def.description,
    starters: def.starters,
    glyph: def.glyph,
    hue: def.hue,
    kind: 'ai',
    subAgent: true,
    templateAgent: def.key,
    model_provider: null,
    model_name: null,
  }));
  const ids = Object.fromEntries(agents.map((a) => [a.templateAgent, a.id]));
  return { ...starter.build({ agents: ids, makeId }), agents, model: { modelProvider: null, modelName: null } };
}
