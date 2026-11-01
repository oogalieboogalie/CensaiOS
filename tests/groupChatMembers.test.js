import { jest } from '@jest/globals';
import { GROUP_RULES, groupTurnMessages, resolveGroupChatMembers } from '../server/routes/chat/groupChatMembers.js';
import { buildSubAgentSystemPrompt } from '../server/routes/chat/prompts.js';
import { pickRoleWindow } from '../server/realEstate/boardWrites.js';
import { buildAgentTeamBoard, AGENT_TEAM_AGENTS } from '../server/templates/starters/agentTeam.js';

const LEAD = { id: 'lead-censai-abc', name: 'Lead', role: 'Splits the job', system_prompt: 'You are the Lead. Hand the first step to the Researcher.' };
const CRITIC = { id: 'critic-censai-abc', name: 'Critic', role: 'Checks the work', system_prompt: 'You are the Critic.' };
const subs = { [LEAD.id]: LEAD, [CRITIC.id]: CRITIC };

describe('group chat with a board\'s own agents (Agent Team room)', () => {
  test('board sub-agents answer, in the order they sit in the room, with their own job', async () => {
    const getSubAgentById = jest.fn(async (id, scope) => (scope.workspaceId === 'ws-1' ? subs[id] || null : null));
    const members = await resolveGroupChatMembers([LEAD.id, CRITIC.id], { workspaceId: 'ws-1', userId: 7, deps: { getSubAgentById } });
    expect(members.map(m => m.name)).toEqual(['Lead', 'Critic']);
    expect(members[0].systemPrompt).toContain('Hand the first step to the Researcher.');
    expect(members[0].systemPrompt).toContain('group chat');
    expect(getSubAgentById).toHaveBeenCalledWith(LEAD.id, { workspaceId: 'ws-1', userId: 7 });
  });

  test('an agent from another board is refused with a message, not silence', async () => {
    const getSubAgentById = jest.fn(async () => null);
    await expect(resolveGroupChatMembers([LEAD.id], { workspaceId: 'ws-2', userId: 7, deps: { getSubAgentById } }))
      .rejects.toMatchObject({ statusCode: 404, message: expect.stringMatching(/not on this board/) });
    await expect(resolveGroupChatMembers([LEAD.id, LEAD.id], { workspaceId: 'ws-1', deps: { getSubAgentById } }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('each agent sees the others by name, its own lines as its own, and may use its tools', () => {
    const [lead, critic] = [LEAD, CRITIC].map(sub => ({ agentId: sub.id, name: sub.name }));
    const names = { [LEAD.id]: 'Lead', [CRITIC.id]: 'Critic' };
    const convo = [{ from: 'me', text: 'Plan a launch page' }, { from: LEAD.id, text: 'Researcher, find three competitors.' }];
    const seen = groupTurnMessages(critic, convo, names);
    expect(seen[0]).toEqual({ from: 'system', text: GROUP_RULES });
    expect(GROUP_RULES).not.toMatch(/cannot use tools/);
    expect(GROUP_RULES).toMatch(/search the web/);
    expect(seen[2]).toEqual({ from: 'Lead', text: 'Researcher, find three competitors.' });
    expect(groupTurnMessages(lead, convo, names)[2]).toEqual({ from: LEAD.id, text: 'Researcher, find three competitors.' });
  });
});

test('one-on-one chat with a starter agent uses the job it was given', async () => {
  const prompt = await buildSubAgentSystemPrompt({ ...LEAD, permission: 'worker', parent_id: 'censai' });
  expect(prompt).toContain('Hand the first step to the Researcher.');
  expect(prompt).not.toMatch(/Ask your parent to recreate you/);
});

test('the team room agents carry the tools their jobs need', () => {
  const tools = Object.fromEntries(AGENT_TEAM_AGENTS.map(a => [a.key, a.tools]));
  expect(tools.researcher).toEqual(expect.arrayContaining(['web_search', 'web_extract', 'project_read']));
  expect(tools.builder).toEqual(expect.arrayContaining(['project_write', 'project_edit', 'canvas_append_window']));
  for (const key of ['lead', 'critic']) {
    expect(tools[key]).toEqual(expect.arrayContaining(['project_read', 'canvas_append_window', 'post_team_chat']));
    expect(tools[key]).not.toContain('project_write');
  }
});

test('post_team_chat lands in the agent\'s own Team Chat when two starters share a board', () => {
  const board = buildAgentTeamBoard({ agents: Object.fromEntries(AGENT_TEAM_AGENTS.map(a => [a.key, `${a.key}-1`])), makeId: () => 'x' });
  const room = board.windows.find(w => w.templateRole === 'teamChat');
  expect(room.teamAgents).toEqual(['lead-1', 'researcher-1', 'builder-1', 'critic-1']);
  const other = { templateRole: 'teamChat', teamAgents: ['planner-1'] };
  expect(pickRoleWindow([['a', other], ['b', room]], 'teamChat', 'critic-1')[0]).toBe('b');
  expect(pickRoleWindow([['a', other], ['b', room]], 'teamChat', 'someone-else')[0]).toBe('a');
});
