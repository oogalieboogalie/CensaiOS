// The live agent directory for one board: every window on the shared canvas
// that can take a task (chat agents, family agent windows, coding CLIs in the
// Agent Console, built modules), what each can do, and whether it is busy.
// Derived from the canvas windows, which sync through Yjs, so every teammate
// sees the same directory. Pure: no store, no fetch.

import { rankAgentCards } from '../../../server/agent-registry/discoveryRank.js';
import { ACTIVE_HELP_STATUSES, HELP_CARD_KIND } from '../../../server/agent-registry/helpCardShape.js';
import { describeCapabilities, getModelCapabilities } from '../chat/modelCapabilities.js';
import { LEADHOUND_KIND } from './leadHoundHelp.js';

const CLI_LABELS = { claudecode: 'Claude Code', codex: 'Codex', gemini: 'Gemini CLI', opencode: 'OpenCode', copilot: 'Copilot CLI', grok: 'Grok' };
const CLI_SKILLS = [
  { id: 'code', name: 'Write and edit code', tags: ['code', 'programming', 'refactor', 'bug', 'fix'] },
  { id: 'review', name: 'Review a change', tags: ['review', 'diff', 'pr'] },
  { id: 'tests', name: 'Run tests and commands', tags: ['test', 'shell', 'build'] },
];

function chatEntry(win, agent) {
  const name = agent?.name || win.title || win.agentId;
  const caps = getModelCapabilities(agent?.model_provider, agent?.model_name);
  const abilities = ['text', ...describeCapabilities(caps), ...(caps.tools ? ['tools'] : [])];
  return {
    executor: 'network',
    cardId: `agent:${String(win.agentId).toLowerCase()}`,
    name,
    role: agent?.role || 'Chat agent',
    model: agent?.model_name || '',
    abilities,
    skills: [{ id: 'chat', name: agent?.role || 'Answer questions', description: agent?.role || '', tags: abilities }],
  };
}

function cliEntry(win) {
  const cli = win.cli || 'claudecode';
  return {
    executor: 'cli',
    cardId: null,
    name: CLI_LABELS[cli] || cli,
    role: 'Coding agent',
    model: '',
    abilities: ['code', 'files', 'shell'],
    skills: CLI_SKILLS,
  };
}

function moduleEntry(win) {
  const name = win.manifest?.name || win.title || 'Module';
  return {
    executor: 'module',
    cardId: null,
    name,
    role: win.manifest?.description || win.request || 'Module on the board',
    model: '',
    abilities: ['answers'],
    skills: [{ id: 'ask', name, description: win.request || '', tags: ['module'] }],
  };
}

// The Research window answers from the board's saved web research, and
// searches the web with Tavily when nothing saved covers the question.
export const RESEARCH_SKILLS = [
  { id: 'web-research', name: 'Web research', description: 'Searches the web with Tavily and answers with sources', tags: ['web research', 'research', 'search', 'web', 'sources', 'facts', 'tavily'] },
  { id: 'knowledge', name: 'Board knowledge base', description: 'Answers from research saved on this board', tags: ['knowledge', 'documents', 'citations'] },
];

function researchEntry(win) {
  return {
    executor: 'research',
    cardId: null,
    name: win.title || 'Research',
    role: 'Web research (Tavily) and the board knowledge base',
    model: '',
    abilities: ['web research', 'citations'],
    skills: RESEARCH_SKILLS,
  };
}

function leadHoundEntry(win) {
  return {
    executor: 'leadhound',
    cardId: null,
    name: win.title || 'LeadHound',
    role: 'Finds sales leads on the live web with Tavily and drafts a 7-day intro sequence',
    model: '',
    abilities: ['web search', 'leads', 'outreach'],
    skills: [{
      id: 'leads',
      name: 'Find sales leads',
      description: 'Searches the web with Tavily, ranks buyers by fit, finds contact details and drafts outreach.',
      tags: ['leads', 'prospects', 'sales', 'outreach', 'customers', 'market', 'tavily', 'web', 'search', 'research'],
    }],
  };
}

function entryFor(win, agentFor) {
  if ((win.kind === 'chat' || win.kind === 'agent') && win.agentId) return chatEntry(win, agentFor(win.agentId));
  if (win.kind === 'agentConsole') return cliEntry(win);
  if (win.kind === 'module' && win.status === 'ready') return moduleEntry(win);
  if (win.kind === 'research') return researchEntry(win);
  if (win.kind === LEADHOUND_KIND) return leadHoundEntry(win);
  return null;
}

/**
 * @param {Array} wins canvas windows
 * @param {{ agentFor?: (agentId) => object|null }} opts
 * @returns {Array<{windowId, kind, executor, cardId, name, role, model, abilities, skills, status, activeRequests}>}
 */
export function listBoardAgents(wins, { agentFor = () => null } = {}) {
  const list = Array.isArray(wins) ? wins : [];
  const active = new Map();
  for (const win of list) {
    if (win?.kind !== HELP_CARD_KIND || !ACTIVE_HELP_STATUSES.has(win.status) || !win.toWindowId) continue;
    active.set(win.toWindowId, (active.get(win.toWindowId) || 0) + 1);
  }
  const out = [];
  for (const win of list) {
    if (!win || win.kind === HELP_CARD_KIND) continue;
    const entry = entryFor(win, agentFor);
    if (!entry) continue;
    const activeRequests = active.get(win.id) || 0;
    const status = activeRequests || win.status === 'building' || win.leadHound?.hunting ? 'working' : 'ready';
    out.push({ ...entry, windowId: win.id, kind: win.kind, agentId: win.agentId || null, status, activeRequests });
  }
  return out;
}

/** Rank the board's agents for a need with the same scoring the server uses. */
export function searchBoardAgents(agents, query = '') {
  const cards = agents.map((agent) => ({
    id: agent.windowId,
    name: agent.name,
    description: `${agent.role} ${agent.model}`.trim(),
    skills: agent.skills,
    metadata: { tags: agent.abilities },
    agent,
  }));
  return rankAgentCards(cards, { query, limit: 50 }).map((entry) => entry.card.agent);
}

/** Help cards on the board, newest first. */
export function listHelpCards(wins) {
  return (Array.isArray(wins) ? wins : [])
    .filter((win) => win?.kind === HELP_CARD_KIND)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
