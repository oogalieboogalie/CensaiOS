// Starter board: Agent Team. Four agents with different jobs share one team
// room (a group chat where each answers in turn, Lead first, so the Lead
// splits the goal and the others pick up their parts), with a workflow canvas, live operations and the agent registry.

import { defaultId, finishBoard, leaf, split, starterAgent } from './shared.js';

export const AGENT_TEAM_TEMPLATE_ID = 'agent-team';

const TEAMWORK = 'You are one of four agents on this board (Lead, Researcher, Builder, Critic). Stay in your lane, keep answers short, and say who should take the next step. You have real tools in the Team room and in your own chat: use them instead of answering from memory, and if a tool you need is missing or fails, say which one in one line.';

// Read the project open on this board; the Builder can also write to it.
const READ_FILES = ['project_list', 'project_read'];
const WRITE_FILES = [...READ_FILES, 'project_write', 'project_edit'];

export const AGENT_TEAM_AGENTS = Object.freeze([
  starterAgent({
    key: 'lead',
    name: 'Lead',
    role: 'Splits the job and hands out the pieces',
    description: 'Turns a goal into steps, says which agent does each one, and pulls the answers together at the end.',
    glyph: 'L',
    hue: 40,
    tools: READ_FILES,
    prompt: `${TEAMWORK} You are the Lead. Turn the person's goal into three to six steps, name the agent for each (Researcher finds facts, Builder makes things, Critic checks them), end with one line handing the first step to that agent by name, and write the plan into the Mission brief with canvas_append_window. When others answer, pull it together into one clear result.`,
    starters: ['Plan a launch page for a new app with the team', 'Who should do what to research our competitors?', 'Sum up what the team found'],
  }),
  starterAgent({
    key: 'researcher',
    name: 'Researcher',
    role: 'Finds the facts',
    description: 'Searches the web, reads pages and brings back facts with where they came from.',
    glyph: 'R',
    hue: 190,
    tools: ['web_search', 'web_extract', ...READ_FILES],
    prompt: `${TEAMWORK} You are the Researcher. Search the web with web_search (and read a page with web_extract) before you answer, and bring back short bullet points, each with its source link and the date you checked. Never give a price or a number from memory. Say clearly when something could not be confirmed.`,
    starters: ['Find three competitors and what they charge', 'What do people complain about with this kind of app?', 'Check this fact for me'],
  }),
  starterAgent({
    key: 'builder',
    name: 'Builder',
    role: 'Makes the thing',
    description: 'Writes the copy, code or plan the Lead asks for and puts it on the board.',
    glyph: 'B',
    hue: 130,
    tools: ['github_read_file', ...WRITE_FILES],
    prompt: `${TEAMWORK} You are the Builder. Make what the Lead asks for (copy, code, a plan or a table) and add it to the Mission brief or a code window with canvas_append_window, or save it as a file in the board's project with project_write. Build the simplest version that works first.`,
    starters: ['Write the launch page headline and three sections', 'Turn the research into a comparison table', 'Draft the first version'],
  }),
  starterAgent({
    key: 'critic',
    name: 'Critic',
    role: 'Checks the work',
    description: 'Reads what the team made, finds what is wrong or weak and says how to fix it.',
    glyph: 'C',
    hue: 0,
    tools: READ_FILES,
    prompt: `${TEAMWORK} You are the Critic. Read what the team made and list what is wrong, missing or weak, most important first, each with a concrete fix. Be honest and kind. Say plainly when it is good enough to ship.`,
    starters: ['Check the Builder\'s draft', 'What did the team miss?', 'Is this ready?'],
  }),
]);

const BRIEF = [
  '# Mission brief',
  '',
  '**Goal:** (what should the team get done?)',
  '',
  '**Done looks like:**',
  '',
  'Type the goal in the Team room (F1). The Lead splits it up, the Researcher finds facts, the Builder makes it and the Critic checks it. Their plan and work land here.',
  '',
].join('\n');

export function buildAgentTeamBoard({ agents, makeId = defaultId }) {
  const tag = makeId();
  const wid = (role) => `at-${role}-${tag}`;
  const ids = {
    room: wid('team-room'), brief: wid('brief'),
    lead: wid('lead-chat'), researcher: wid('researcher-chat'), builder: wid('builder-chat'), critic: wid('critic-chat'),
    workflow: wid('workflow'), operations: wid('operations'),
    registry: wid('registry'), designer: wid('designer'),
  };
  const team = [agents.lead, agents.researcher, agents.builder, agents.critic];

  const windows = [
    // F1 Team room: everyone answers in turn; agents post here too.
    { id: ids.room, kind: 'groupChat', title: 'Team room', templateRole: 'teamChat', members: team, msgs: [
      { from: agents.lead, text: 'We are ready. Give us a goal and I will split it up: the Researcher finds facts, the Builder makes it, the Critic checks it.' },
    ] },
    { id: ids.brief, kind: 'doc', title: 'Mission brief', fileName: 'mission-brief.md', text: BRIEF, templateRole: 'brief' },
    // F2 One-on-one with each agent
    { id: ids.lead, kind: 'chat', title: 'Lead', agentId: agents.lead },
    { id: ids.researcher, kind: 'chat', title: 'Researcher', agentId: agents.researcher },
    { id: ids.builder, kind: 'chat', title: 'Builder', agentId: agents.builder },
    { id: ids.critic, kind: 'chat', title: 'Critic', agentId: agents.critic },
    // F3 Run it on a schedule or as steps
    { id: ids.workflow, kind: 'workflow', title: 'Workflow' },
    { id: ids.operations, kind: 'operationsBoard', title: 'Live operations' },
    // F4 Find and make agents
    { id: ids.registry, kind: 'registry', title: 'Agent registry' },
    { id: ids.designer, kind: 'agentDesigner', title: 'Make an agent' },
  ];

  const groups = [
    { key: 'room', label: 'Team room', hotkey: '1', x: 0, y: 0, w: 1480, h: 900, root: split('vertical', 0.58, leaf(ids.room), leaf(ids.brief)) },
    {
      key: 'agents', label: 'Agents', hotkey: '2', x: 1640, y: 0, w: 1480, h: 900,
      root: split('horizontal', 0.5, split('vertical', 0.5, leaf(ids.lead), leaf(ids.researcher)), split('vertical', 0.5, leaf(ids.builder), leaf(ids.critic))),
    },
    { key: 'run', label: 'Workflows', hotkey: '3', x: 0, y: 1060, w: 1480, h: 860, root: split('vertical', 0.6, leaf(ids.workflow), leaf(ids.operations)) },
    { key: 'directory', label: 'Directory', hotkey: '4', x: 1640, y: 1060, w: 1480, h: 860, root: split('vertical', 0.5, leaf(ids.registry), leaf(ids.designer)) },
  ];

  return finishBoard({ templateId: AGENT_TEAM_TEMPLATE_ID, name: 'Agent Team', prefix: 'at', tag, windows, groups, windowIds: ids });
}

export const AGENT_TEAM_TEMPLATE = Object.freeze({
  id: AGENT_TEAM_TEMPLATE_ID,
  name: 'Agent Team',
  description: 'Four agents with different jobs (Lead, Researcher, Builder, Critic) share a team room: the Lead splits your goal and the others take their parts, in turn.',
  groups: ['Team room', 'Agents', 'Workflows', 'Directory'],
  groupContents: {
    'Team room': 'Group chat with all four agents, mission brief',
    Agents: 'One-on-one chat with each agent',
    Workflows: 'Workflow canvas, live operations',
    Directory: 'Agent registry, make your own agent',
  },
  agents: AGENT_TEAM_AGENTS.map(agent => agent.name),
  modules: ['Group chat', 'Workflow', 'Live operations', 'Agent registry', 'Agent designer'],
});
