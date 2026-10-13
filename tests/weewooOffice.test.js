import { snapshotToDoc } from '../server/collab/seedFromSnapshot.js';
import { readDocWindows } from '../server/agent-registry/helpCards.js';
import { applyAvatarInDoc } from '../server/tools/handlers/weewoo.js';
import { weewooTools } from '../server/tools/definitions/weewoo.js';
import { avatarCells, defaultAvatar, normalizeAvatar } from '../src/lib/weewoo/avatarParts.js';
import { agentActivity, buildOffice, officeFeed, roleDepartment } from '../src/lib/weewoo/office.js';
import {
  LOBBY_ID, addDepartmentPatch, companyStarter, editDepartmentPatch, listDepartments, removeDepartmentPatch, seatPatch,
} from '../src/lib/weewoo/company.js';
import { runEnded, runStarted, runTool } from '../src/lib/weewoo/agentRun.js';
import { demoAgentFor, demoWindows } from '../src/lib/weewoo/demoOffice.js';

const NOW = Date.parse('2026-10-10T12:00:00Z');
const MIN = 60 * 1000;
const records = {
  atlas: { id: 'atlas', name: 'Atlas', role: 'Backend specialist', model_name: 'standin' },
  echo: { id: 'echo', name: 'Echo', role: 'Business strategist', model_name: 'standin' },
  censai: { id: 'censai', name: 'Censai', role: 'Editorial and research lead', model_name: 'standin' },
};
const agentFor = (id) => records[id] || null;
const chat = (id, agentId, extra = {}) => ({ id, kind: 'chat', agentId, x: 0, y: 0, w: 400, h: 300, ...extra });

describe('avatars', () => {
  test('every agent gets a default avatar from its role, the same one every time', () => {
    const a = defaultAvatar('atlas', 'engineering');
    expect(a).toEqual(defaultAvatar('atlas', 'engineering'));
    expect(['cube', 'crab', 'bird', 'rocket']).toContain(a.body);
    expect(a.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  test('avatars from people or agents are cleaned; color names work', () => {
    expect(normalizeAvatar({ body: 'owl', color: 'teal', eyes: 'shades', accessory: 'crown', by: 'agent' }))
      .toEqual({ body: 'owl', color: '#7ec7c0', eyes: 'shades', accessory: 'crown', by: 'agent' });
    expect(normalizeAvatar({ body: 'dragon', color: 'nope' })).toBeNull();
    expect(normalizeAvatar({ body: 'dragon', color: '#ABCDEF' }, { body: 'egg', color: '#111111' })).toMatchObject({ body: 'egg', color: '#abcdef' });
  });

  test('cells are 14 by 14 and accessories draw over the body', () => {
    const cells = avatarCells({ body: 'slime', color: '#7fb3d5', eyes: 'sparkle', accessory: 'crown' });
    expect(cells).toHaveLength(14);
    cells.forEach((row) => expect(row).toHaveLength(14));
    expect(cells[0].join('')).toContain('y');
    expect(cells.flat()).toContain('w');
  });
});

describe('company', () => {
  test('a new company has the five WeeWoo departments plus the Lobby', () => {
    const depts = listDepartments(companyStarter('Acme'));
    expect(depts.map((d) => d.name)).toEqual(['Operations', 'Engineering', 'Research', 'Growth', 'People', 'Lobby']);
  });

  test('departments are added, renamed and removed one field at a time', () => {
    let win = companyStarter();
    const add = addDepartmentPatch(win, { name: 'Legal', id: 'legal' });
    expect(Object.keys(add)).toEqual(['wd.legal']);
    win = { ...win, ...add, ...seatPatch('w-atlas', 'legal') };
    win = { ...win, ...editDepartmentPatch(win, 'legal', { name: 'Legal and compliance' }) };
    expect(listDepartments(win).find((d) => d.id === 'legal').name).toBe('Legal and compliance');
    const remove = removeDepartmentPatch(win, 'legal');
    expect(remove).toEqual({ 'wd.legal': null, 'ws.w-atlas': LOBBY_ID });
  });
});

describe('agent activity from real signals', () => {
  test('a chat run: thinking, then a tool, then done', () => {
    let run = runStarted(null, { prompt: 'write a migration', now: NOW - 2000 });
    expect(agentActivity(chat('w', 'atlas', { agentRun: run }), [], NOW)).toMatchObject({ status: 'working', mood: 'thoughtful', task: 'write a migration' });
    run = runTool(run, { tool: 'project_write', now: NOW - 1000 });
    expect(agentActivity(chat('w', 'atlas', { agentRun: run }), [], NOW)).toMatchObject({ status: 'working', mood: 'focused', tool: 'project_write' });
    run = runEnded(run, { state: 'done', text: 'Here it is', now: NOW });
    const done = agentActivity(chat('w', 'atlas', { agentRun: run }), [], NOW);
    expect(done).toMatchObject({ status: 'idle', mood: 'cheerful', runsLastHour: 1 });
    expect(done.energy).toBeLessThan(1);
  });

  test('errors fluster an agent and drain energy; a long quiet spell is a nap', () => {
    const run = runEnded(runStarted(null, { now: NOW - 5000 }), { state: 'error', text: 'rate limited', now: NOW - 4000 });
    expect(agentActivity(chat('w', 'atlas', { agentRun: run }), [], NOW)).toMatchObject({ status: 'error', mood: 'flustered', task: 'rate limited' });
    expect(agentActivity(chat('w', 'atlas', { agentRun: run }), [], NOW + 45 * MIN)).toMatchObject({ status: 'napping', mood: 'sleepy' });
  });

  test('an abandoned "thinking" record does not keep an agent busy forever', () => {
    const run = runStarted(null, { now: NOW - 30 * MIN });
    expect(agentActivity(chat('w', 'atlas', { agentRun: run }), [], NOW).status).not.toBe('working');
  });

  test('help requests: the helper works, the asker waits, approval waits', () => {
    const card = { id: 'c1', kind: 'agentHelp', fromWindowId: 'w-a', toWindowId: 'w-b', fromLabel: 'Atlas', toLabel: 'Echo', task: 'price check', status: 'working', createdAt: new Date(NOW).toISOString(), updatedAt: new Date(NOW).toISOString() };
    expect(agentActivity(chat('w-b', 'echo'), [card], NOW)).toMatchObject({ status: 'working', mood: 'helpful', task: 'price check' });
    expect(agentActivity(chat('w-a', 'atlas'), [card], NOW)).toMatchObject({ status: 'waiting', task: 'Waiting on Echo' });
    expect(agentActivity({ id: 'w-b', kind: 'agentConsole' }, [{ ...card, status: 'needs approval' }], NOW)).toMatchObject({ status: 'waiting', mood: 'patient' });
  });

  test('a coding agent follows its console task', () => {
    expect(agentActivity({ id: 'c', kind: 'agentConsole', cliStatus: 'running', cliStatusAt: NOW }, [], NOW).status).toBe('working');
    expect(agentActivity({ id: 'c', kind: 'agentConsole', cliStatus: 'needs_approval', cliStatusAt: NOW }, [], NOW).status).toBe('waiting');
    expect(agentActivity({ id: 'c', kind: 'agentConsole', cliStatus: 'failed', cliStatusAt: NOW }, [], NOW).status).toBe('error');
  });
});

describe('the office floor', () => {
  test('agents land in departments by role, people can move them, unknown ones go to the Lobby', () => {
    expect(roleDepartment({ kind: 'chat', role: 'Backend specialist' })).toBe('engineering');
    expect(roleDepartment({ kind: 'chat', role: 'Business strategist' })).toBe('growth');
    expect(roleDepartment({ kind: 'chat', role: 'Poet' })).toBe(LOBBY_ID);
    const wins = [chat('w-atlas', 'atlas'), chat('w-echo', 'echo'), chat('w-x', 'stranger'), { id: 'n', kind: 'note' }];
    const company = { ...companyStarter(), ...seatPatch('w-echo', 'research') };
    const office = buildOffice(company, wins, { agentFor, now: NOW });
    const where = Object.fromEntries(office.agents.map((a) => [a.windowId, [a.deptId, a.seatedBy]]));
    expect(where).toEqual({ 'w-atlas': ['engineering', 'auto'], 'w-echo': ['research', 'person'], 'w-x': [LOBBY_ID, 'auto'] });
    expect(office.rooms.find((r) => r.id === 'research').agents.map((a) => a.name)).toEqual(['Echo']);
  });

  test('a chosen avatar wins over the default; help cards become threads and feed rows', () => {
    const card = { id: 'c1', kind: 'agentHelp', fromWindowId: 'w-atlas', toWindowId: 'w-echo', fromLabel: 'Atlas', toLabel: 'Echo', task: 'price check', status: 'completed', result: '$40', createdAt: new Date(NOW - 2000).toISOString(), updatedAt: new Date(NOW - 1000).toISOString() };
    const wins = [chat('w-atlas', 'atlas', { avatar: { body: 'owl', color: '#7ec7c0', by: 'agent' } }), chat('w-echo', 'echo'), card];
    const office = buildOffice(companyStarter(), wins, { agentFor, now: NOW });
    expect(office.agents[0]).toMatchObject({ avatarBy: 'agent', avatar: { body: 'owl', color: '#7ec7c0' } });
    expect(office.threads).toEqual([expect.objectContaining({ from: 'w-atlas', to: 'w-echo', result: '$40' })]);
    expect(officeFeed(office)[0]).toMatchObject({ who: 'Echo', text: 'answered Atlas' });
  });

  test('the demo office is the same for everyone at the same moment', () => {
    const a = buildOffice(companyStarter(), demoWindows(NOW), { agentFor: demoAgentFor, now: NOW });
    const b = buildOffice(companyStarter(), demoWindows(NOW), { agentFor: demoAgentFor, now: NOW });
    expect(a.agents.length).toBe(12);
    expect(a.agents.map((x) => x.status)).toEqual(b.agents.map((x) => x.status));
    expect(a.threads.length).toBe(3);
  });
});

describe('choose_avatar', () => {
  test('the tool offers every body and needs a body and color', () => {
    const fn = weewooTools[0].function;
    expect(fn.name).toBe('choose_avatar');
    expect(fn.parameters.required).toEqual(['body', 'color']);
    expect(fn.parameters.properties.body.enum).toContain('owl');
  });

  test('the avatar lands on the window the agent is talking in, or all its windows', () => {
    const doc = snapshotToDoc({ wins: [chat('w1', 'atlas'), chat('w2', 'atlas', { x: 500 }), chat('w3', 'echo', { x: 1000 })] });
    const avatar = normalizeAvatar({ body: 'rocket', color: 'coral', by: 'agent' });
    expect(applyAvatarInDoc(doc, { agentId: 'atlas', windowId: 'w2', avatar })).toBe(1);
    let wins = readDocWindows(doc);
    expect(wins.find((w) => w.id === 'w2').avatar).toMatchObject({ body: 'rocket', by: 'agent' });
    expect(wins.find((w) => w.id === 'w1').avatar).toBeUndefined();
    expect(applyAvatarInDoc(doc, { agentId: 'Atlas', avatar })).toBe(2);
    wins = readDocWindows(doc);
    expect(wins.find((w) => w.id === 'w3').avatar).toBeUndefined();
  });
});
