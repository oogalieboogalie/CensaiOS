import { jest } from '@jest/globals';

// Sub-agent data boxes (Alex's diagram 15): each sub-agent has its own
// numbered box (001, 002...) that it and its main agent can read and write;
// a sub-agent can never reach a sibling's box.

const store = new Map();
const SUBS = [
  { id: 'sub-b', parent_id: 'nexus', name: 'Mapper', created_at: '2026-10-16T10:00:00Z' },
  { id: 'sub-a', parent_id: 'nexus', name: 'Scout', created_at: '2026-10-16T09:00:00Z' },
];
jest.unstable_mockModule('../server/memory.js', () => ({
  getSubAgents: jest.fn(async (parentId) => SUBS.filter((s) => s.parent_id === parentId)),
  getSubAgentById: jest.fn(async (id) => SUBS.find((s) => s.id === id) || null),
  scratchpadWrite: jest.fn(async (id, project, key, value) => { store.set(`${id}/${key}`, value); return { key, value }; }),
  scratchpadRead: jest.fn(async (id) => [...store].filter(([k]) => k.startsWith(`${id}/`)).map(([k, value]) => ({ key: k.split('/')[1], value }))),
  scratchpadClear: jest.fn(async () => 0),
}));

const { boxLabel, boxNumbers, pickBox, boxText } = await import('../src/lib/agents/dataBoxes.js');
const { handleDataBoxTool } = await import('../server/tools/handlers/dataBox.js');
const { SHARED_SUB_AGENT_TOOLS } = await import('../server/tools/rbac/constants.js');
const ctx = { workspaceId: 'w1', userId: 1 };

describe('data box numbers', () => {
  test('number each main agent\'s sub-agents in the order they were made', () => {
    const numbers = boxNumbers([...SUBS, { id: 'other', parent_id: 'atlas', name: 'Solo', created_at: '2026-10-16T08:00:00Z' }]);
    expect(numbers.get('sub-a')).toBe('001');
    expect(numbers.get('sub-b')).toBe('002');
    expect(numbers.get('other')).toBe('001');
    expect(boxLabel(12)).toBe('012');
  });

  test('a main agent picks by name, id or number; a sub-agent only gets its own box', () => {
    expect(pickBox({ children: SUBS, asked: 'mapper' })?.id).toBe('sub-b');
    expect(pickBox({ children: SUBS, asked: '1' })?.id).toBe('sub-a');
    expect(pickBox({ children: SUBS, asked: '' })).toBeNull();
    expect(pickBox({ caller: SUBS[0], children: [], asked: '' })?.id).toBe('sub-b');
    expect(pickBox({ caller: SUBS[0], children: [], asked: 'Scout' })).toBeNull();
    expect(boxText([{ key: 'todo', value: 'map the repo' }])).toBe('[todo]: map the repo');
  });
});

describe('data box tools', () => {
  test('a sub-agent writes its own box and its main agent reads it', async () => {
    expect(await handleDataBoxTool('sub-b', 'scratchpad_write', { key: 'found', value: 'three routes' }, ctx)).toBe('Wrote "found" to Mapper\'s data box 002 (project: default).');
    expect(await handleDataBoxTool('nexus', 'scratchpad_read', { sub_agent: 'Mapper' }, ctx)).toBe('[found]: three routes');
    expect(await handleDataBoxTool('nexus', 'scratchpad_read', { sub_agent: '002' }, ctx)).toBe('[found]: three routes');
  });

  test('a sub-agent cannot open a sibling\'s box', async () => {
    expect(await handleDataBoxTool('sub-b', 'scratchpad_read', { sub_agent: 'Scout' }, ctx)).toMatch(/No sub-agent found matching "Scout"/);
  });

  test('sub-agents are given the read and write tools for their own box, not clear', () => {
    expect(SHARED_SUB_AGENT_TOOLS).toEqual(expect.arrayContaining(['scratchpad_write', 'scratchpad_read']));
    expect(SHARED_SUB_AGENT_TOOLS).not.toContain('scratchpad_clear');
  });
});

describe('data box door', () => {
  test('gives the GET and POST addresses for one sub-agent\'s box', async () => {
    const { boxDoor } = await import('../src/lib/agents/dataBoxes.js');
    const door = boxDoor({ subId: 'sub a', workspaceId: 'w1', origin: 'http://localhost:3002/' });
    expect(door.read).toBe('http://localhost:3002/api/scratchpad/sub%20a/default?workspaceId=w1');
    expect(door.readOne).toBe(`${door.read}&key=note-name`);
    expect(door.post).toBe('http://localhost:3002/api/scratchpad/sub%20a/default');
    expect(JSON.parse(door.body)).toEqual({ workspaceId: 'w1', key: 'note-name', value: 'what to keep' });
    expect(door.curlPost).toContain('curl -X POST http://localhost:3002/api/scratchpad/sub%20a/default');
    expect(boxDoor({})).toBeNull();
  });
});
