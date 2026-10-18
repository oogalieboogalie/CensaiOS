import { jest } from '@jest/globals';
import { cleanShelf, guessShelf, shelfOf, SHELVES } from '../src/lib/agentMemory/shelves.js';
import { normalizeFactInput, planFactWrite } from '../server/agentMemory/facts.js';
import { buildMemoryBlock } from '../server/agentMemory/recall.js';
import { writeFact } from '../server/agentMemory/store.js';
import { MEMORY_TOOL_DEFINITIONS } from '../server/agentMemory/tools.js';

describe('agent memory shelves (diagram 20)', () => {
  test('has the five shelves from the drawing', () => {
    expect(SHELVES.map((s) => s.label)).toEqual(['Personal', 'Project', 'Team', 'Accomplishments', 'Tooling']);
    expect(cleanShelf(' Team ')).toBe('team');
    expect(cleanShelf('kitchen')).toBe('');
  });

  test('guesses a shelf from the words when nobody filed one', () => {
    expect(guessShelf('the user', 'favorite color', 'green')).toBe('personal');
    expect(guessShelf('the project', 'architecture', 'React + Express')).toBe('project');
    expect(guessShelf('the team', 'culture', 'ship small')).toBe('team');
    expect(guessShelf('Jordan', 'launch', 'shipped the landing page')).toBe('accomplishments');
    expect(guessShelf('the user', 'where backups live', 'D:/backups')).toBe('tooling');
    expect(shelfOf({ shelf: 'team', attribute: 'favorite color' })).toBe('team');
  });

  test('a filed shelf is kept through a change and written to the database', async () => {
    const input = normalizeFactInput({ attribute: 'roadmap', value: 'v2 in May', shelf: 'project' });
    expect(input.shelf).toBe('project');
    const plan = planFactWrite({ value: 'v1', valid_from: '2026-01-01' }, input, new Date('2026-10-16'));
    expect(plan.rows.every((r) => r.shelf === 'project')).toBe(true);

    const query = jest.fn(async (sql) => (sql.startsWith('SELECT') ? { rows: [] } : { rows: [{ id: 1, change_kind: 'new' }] }));
    const db = { query, connect: async () => ({ query, release() {} }) };
    await writeFact(db, { userId: 1, agentId: 'atlas', input });
    const insert = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO agent_facts'));
    expect(insert[0]).toContain('shelf');
    expect(insert[1].at(-1)).toBe('project');
  });

  test('agents can file facts on a shelf and see the shelf in their memory', () => {
    const remember = MEMORY_TOOL_DEFINITIONS.find((t) => t.function.name === 'remember_fact');
    expect(remember.function.parameters.properties.shelf.enum).toContain('accomplishments');
    const block = buildMemoryBlock({ facts: [{ subject: 'the team', attribute: 'purpose', value: 'help agents', shelf: 'team', valid_from: '2026-10-01', recorded_at: '2026-10-01' }] });
    expect(block).toContain('- [Team] purpose of the team: help agents');
  });
});
