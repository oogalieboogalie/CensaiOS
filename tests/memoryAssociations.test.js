// The links an agent builds between named things when it saves a note: only
// real names are linked, a link is stored once, and one seen again grows
// stronger instead of being saved a second time.
import { jest } from '@jest/globals';

// A stand-in for the association_web table: rows in memory, the same two
// statements relations.js sends.
const rows = [];
const query = jest.fn(async (sql, params) => {
  if (/^\s*UPDATE association_web/.test(sql)) {
    const [agentId, a, b, workspaceId, fifth, sixth] = params;
    const hits = rows.filter((r) => r.agent_id === agentId && r.concept_a === a && r.concept_b === b && r.workspace_id === workspaceId);
    for (const row of hits) {
      if (sql.includes('GREATEST')) {
        row.strength = Math.max(row.strength, fifth);
        row.association_type = sixth;
      } else {
        row.strength = Math.min(row.strength + fifth, 1);
        row.access_count += 1;
      }
    }
    return { rows: hits.map((r) => ({ id: r.id })) };
  }
  if (/^\s*INSERT INTO association_web/.test(sql)) {
    const [agent_id, concept_a, concept_b, strength, association_type, , workspace_id] = params;
    const row = { id: rows.length + 1, agent_id, concept_a, concept_b, strength, association_type, workspace_id, access_count: 0 };
    rows.push(row);
    return { rows: [{ id: row.id }] };
  }
  return { rows: [] };
});

jest.unstable_mockModule('../server/db.js', () => ({ default: { query } }));

const { addAssociation, autoAssociate, extractConcepts } = await import('../server/memory/relations.js');
const { CO_OCCURRENCE_REPEATED } = await import('../server/memory/associationStrength.js');

const scope = { workspaceId: 'ws-1', userId: 7 };
const pairs = () => rows.map((r) => `${r.concept_a} > ${r.concept_b}`);

beforeEach(() => {
  rows.length = 0;
  query.mockClear();
});

describe('extractConcepts', () => {
  test('a word with a capital only because it starts a sentence is not a concept', () => {
    expect(extractConcepts('Foundation asked Nexus. When it failed, we stopped. This broke Docker.'))
      .toEqual(['Foundation', 'Nexus', 'Docker']);
  });
  test('keeps a name of several words and drops the sentence word in front of it', () => {
    expect(extractConcepts('When Alma joined Indigo Labs, The Scheduler was new.'))
      .toEqual(['Alma', 'Indigo Labs', 'Scheduler']);
  });
  test('names a thing once however often the note says it', () => {
    expect(extractConcepts('Foundation told Foundation that Docker runs Foundation.')).toEqual(['Foundation', 'Docker']);
  });
  test('"Don\'t" is not the name "Don", and a line break ends a name', () => {
    expect(extractConcepts('Don\'t restart Docker. Didn’t Nexus fail? Won\'t fix.')).toEqual(['Docker', 'Nexus']);
    expect(extractConcepts('Scheduler runs in Docker\nThis broke Nexus')).toEqual(['Scheduler', 'Docker', 'Nexus']);
    expect(extractConcepts('Alma\'s board uses Docker.')).toEqual(['Alma', 'Docker']);
  });
  test('a note with no names has no concepts', () => {
    expect(extractConcepts('This is fine. When it works, it works.')).toEqual([]);
    expect(extractConcepts('')).toEqual([]);
  });
});

describe('autoAssociate', () => {
  test('links the names in a note, never a filler word and never a thing to itself', async () => {
    await autoAssociate('atlas', 'Foundation told Foundation about Nexus. When it failed, This broke Docker.', scope);
    expect(pairs().sort()).toEqual([
      'Docker > Nexus', 'Foundation > Nexus', 'Nexus > Docker', 'Nexus > Foundation',
    ]);
  });
  test('the same note saved twice keeps one link each way, and it is now strong enough to show', async () => {
    await autoAssociate('atlas', 'Scheduler runs in Docker.', scope);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.strength <= CO_OCCURRENCE_REPEATED)).toBe(true);
    await autoAssociate('atlas', 'Scheduler runs in Docker.', scope);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.strength > CO_OCCURRENCE_REPEATED)).toBe(true);
  });
  test('another board keeps its own links', async () => {
    await autoAssociate('atlas', 'Scheduler runs in Docker.', scope);
    await autoAssociate('atlas', 'Scheduler runs in Docker.', { workspaceId: 'ws-2', userId: 7 });
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.strength <= CO_OCCURRENCE_REPEATED)).toBe(true);
    // The stand-in table above trusts the board it is handed, so check the
    // statement itself asks for this agent on this board.
    const lookups = query.mock.calls.filter(([sql]) => /^\s*UPDATE association_web/.test(sql));
    expect(lookups.length).toBeGreaterThan(0);
    for (const [sql, params] of lookups) {
      expect(sql).toMatch(/WHERE agent_id = \$1 AND concept_a = \$2 AND concept_b = \$3 AND workspace_id = \$4/);
      expect(['ws-1', 'ws-2']).toContain(params[3]);
    }
  });
});

describe('addAssociation', () => {
  test('a link asked for twice is stored once each way and keeps the stronger strength', async () => {
    const first = await addAssociation('atlas', 'Scheduler', 'Docker', 0.6, 'agent-created', null, scope);
    const again = await addAssociation('atlas', 'Scheduler', 'Docker', 0.4, 'agent-created', null, scope);
    expect(again).toBe(first);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.strength)).toEqual([0.6, 0.6]);
  });
  test('asking for a link that was only noticed before makes it one that was asked for', async () => {
    await autoAssociate('atlas', 'Scheduler runs in Docker.', scope);
    await addAssociation('atlas', 'Scheduler', 'Docker', 0.6, 'agent-created', null, scope);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.association_type)).toEqual(['agent-created', 'agent-created']);
  });
  test('a thing linked to itself is refused in words, and nothing is saved', async () => {
    await expect(addAssociation('atlas', 'Docker', 'docker', 0.6, 'agent-created', null, scope))
      .rejects.toThrow('A link needs two different things.');
    expect(rows).toHaveLength(0);
  });
  test('still needs a board and a person', async () => {
    await expect(addAssociation('atlas', 'A', 'B', 0.5, 'semantic', null, {})).rejects.toThrow(/workspace/i);
    await expect(addAssociation('atlas', 'A', 'B', 0.5, 'semantic', null, { workspaceId: 'ws-1' })).rejects.toThrow(/user/i);
    await expect(autoAssociate('atlas', 'Scheduler runs in Docker.', { workspaceId: 'ws-1' })).rejects.toThrow(/user/i);
    expect(rows).toHaveLength(0);
  });
});
