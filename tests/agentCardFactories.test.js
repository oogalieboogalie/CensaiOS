import { jest } from '@jest/globals';

const query = jest.fn();
jest.unstable_mockModule('../server/db.js', () => ({
  default: { query },
}));

// The schema is one-shot idempotent and only the real DB cares about it.
// In these factory tests we don't care about the migration itself — that's
// what tests/agentCardSchema.test.js covers. Stub the schema bootstrap so
// pool.query counts in the assertions line up 1:1 with the operations we
// actually want to verify.
jest.unstable_mockModule('../server/agent-registry/schema.js', () => ({
  ensureAgentCardSchema: jest.fn().mockResolvedValue(undefined),
}));

const {
  createAgentCard,
  getAgentCard,
  listAgentCards,
  updateAgentCard,
  deleteAgentCard,
  upsertSystemAgentCard,
} = await import('../server/agent-registry/factories.js');

describe('agent-registry/factories', () => {
  beforeEach(() => {
    query.mockReset();
    // Default: return a representative card so single-call tests get a row
    // without needing to set up a one-time mock.
    query.mockResolvedValue({ rows: [{ id: 'agent:default', name: 'Default' }] });
  });

  // ---- createAgentCard --------------------------------------------------

  describe('createAgentCard', () => {
    test('inserts a card with the A2A-aligned columns and returns the row', async () => {
      const created = { id: 'agent:test', name: 'Test', description: 'A test agent' };
      query.mockResolvedValueOnce({ rows: [created] });

      const result = await createAgentCard({
        id: 'agent:test',
        name: 'Test',
        description: 'A test agent',
        skills: [{ id: 'ping', name: 'Ping' }],
        auth: { type: 'none' },
        visibility: 'public',
      });

      expect(result).toEqual(created);
      const [sql, params] = query.mock.calls[query.mock.calls.length - 1];
      expect(sql).toContain('INSERT INTO agent_cards');
      expect(sql).toContain('RETURNING *');
      expect(params[0]).toBe('agent:test');
      expect(params[1]).toBe('Test');
      expect(params[4]).toBe(JSON.stringify([{ id: 'ping', name: 'Ping' }]));
      expect(params[6]).toBe(JSON.stringify({ type: 'none' }));
      expect(params[9]).toBe('public');
    });

    test('defaults version, skills, auth, visibility when not provided', async () => {
      await createAgentCard({ id: 'agent:min', name: 'Min', description: 'Minimal' });
      const [, params] = query.mock.calls[query.mock.calls.length - 1];
      expect(params[3]).toBe('0.1.0');        // version
      expect(params[4]).toBe('[]');            // skills
      expect(params[6]).toBe('{}');            // auth
      expect(params[9]).toBe('private');      // visibility
    });

    test('rejects an empty id', async () => {
      await expect(createAgentCard({ id: '', name: 'X', description: 'Y' }))
        .rejects.toThrow(/non-empty id/);
    });

    test('rejects missing name', async () => {
      await expect(createAgentCard({ id: 'a', description: 'Y' }))
        .rejects.toThrow(/non-empty name/);
    });

    test('rejects an invalid visibility', async () => {
      await expect(createAgentCard({
        id: 'a', name: 'A', description: 'd', visibility: 'global',
      })).rejects.toThrow(/visibility must be one of/);
    });

    test('rejects an invalid auth.type', async () => {
      await expect(createAgentCard({
        id: 'a', name: 'A', description: 'd', auth: { type: 'magic' },
      })).rejects.toThrow(/auth\.type must be one of/);
    });

    test('rejects non-array skills', async () => {
      await expect(createAgentCard({
        id: 'a', name: 'A', description: 'd', skills: 'not-an-array',
      })).rejects.toThrow(/skills must be an array/);
    });
  });

  // ---- getAgentCard -----------------------------------------------------

  describe('getAgentCard', () => {
    test('returns the row and excludes soft-deleted cards', async () => {
      const card = { id: 'agent:echo', name: 'Echo' };
      query.mockResolvedValueOnce({ rows: [card] });
      const result = await getAgentCard('agent:echo');
      expect(result).toEqual(card);
      const [sql, params] = query.mock.calls[query.mock.calls.length - 1];
      expect(sql).toContain('WHERE id = $1 AND deleted_at IS NULL');
      expect(params).toEqual(['agent:echo']);
    });

    test('returns null when the row is missing', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      const card = await getAgentCard('agent:ghost');
      expect(card).toBeNull();
    });

    test('returns null for a falsy id without querying', async () => {
      const card = await getAgentCard(null);
      expect(card).toBeNull();
      expect(query).not.toHaveBeenCalled();
    });
  });

  // ---- listAgentCards ---------------------------------------------------

  describe('listAgentCards', () => {
    test('paginates with limit and offset, excludes soft-deleted', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 'agent:a' }, { id: 'agent:b' }] });
      const cards = await listAgentCards({ limit: 10, offset: 20 });
      expect(cards).toHaveLength(2);
      const [sql, params] = query.mock.calls[query.mock.calls.length - 1];
      expect(sql).toContain('deleted_at IS NULL');
      expect(sql).toContain('LIMIT $');
      expect(sql).toContain('OFFSET $');
      expect(params).toEqual([10, 20]);
    });

    test('filters by visibility, owner_id, workspace_id', async () => {
      await listAgentCards({ visibility: 'private', owner_id: 'u1', workspace_id: 'w1' });
      const [sql, params] = query.mock.calls[query.mock.calls.length - 1];
      expect(sql).toContain('visibility = $1');
      expect(sql).toContain('owner_id = $2');
      expect(sql).toContain('workspace_id = $3');
      expect(params.slice(0, 3)).toEqual(['private', 'u1', 'w1']);
    });

    test('rejects an invalid visibility filter', async () => {
      await expect(listAgentCards({ visibility: 'global' }))
        .rejects.toThrow(/visibility must be one of/);
    });

    test('clamps limit to a sane range', async () => {
      await listAgentCards({ limit: 10000 });
      const [, params] = query.mock.calls[query.mock.calls.length - 1];
      expect(params[0]).toBeLessThanOrEqual(500);
    });
  });

  // ---- updateAgentCard --------------------------------------------------

  describe('updateAgentCard', () => {
    test('patches writable fields and bumps updated_at', async () => {
      const updated = { id: 'agent:echo', name: 'Echo v2' };
      query.mockResolvedValueOnce({ rows: [updated] });
      const result = await updateAgentCard('agent:echo', { name: 'Echo v2', visibility: 'workspace' });
      expect(result).toEqual(updated);
      const [sql, params] = query.mock.calls[query.mock.calls.length - 1];
      expect(sql).toContain('UPDATE agent_cards');
      expect(sql).toContain('updated_at = NOW()');
      expect(sql).toContain('WHERE id = $');
      expect(params[params.length - 1]).toBe('agent:echo');
    });

    test('serializes jsonb fields with ::jsonb cast', async () => {
      await updateAgentCard('agent:a', {
        skills: [{ id: 'pong' }],
        metadata: { region: 'us-west' },
      });
      const [sql, params] = query.mock.calls[query.mock.calls.length - 1];
      expect(sql).toContain('skills = $');
      expect(sql).toContain('::jsonb');
      // skills and metadata get serialized; the order matches WRITABLE iteration
      expect(params).toContain(JSON.stringify([{ id: 'pong' }]));
      expect(params).toContain(JSON.stringify({ region: 'us-west' }));
    });

    test('returns the current row when the patch is empty (no-op)', async () => {
      // No UPDATE — getAgentCard is invoked, which does its own SELECT.
      query.mockResolvedValueOnce({ rows: [{ id: 'agent:a', name: 'A' }] });
      const result = await updateAgentCard('agent:a', {});
      expect(result).toEqual({ id: 'agent:a', name: 'A' });
      const [sql] = query.mock.calls[query.mock.calls.length - 1];
      expect(sql).toContain('WHERE id = $1 AND deleted_at IS NULL');
    });

    test('rejects an invalid visibility in the patch', async () => {
      await expect(updateAgentCard('agent:a', { visibility: 'global' }))
        .rejects.toThrow(/visibility must be one of/);
    });
  });

  // ---- deleteAgentCard --------------------------------------------------

  describe('deleteAgentCard', () => {
    test('soft-deletes by setting deleted_at', async () => {
      const deleted = { id: 'agent:echo', deleted_at: new Date() };
      query.mockResolvedValueOnce({ rows: [deleted] });
      const result = await deleteAgentCard('agent:echo');
      expect(result).toMatchObject({ id: 'agent:echo' });
      const [sql, params] = query.mock.calls[query.mock.calls.length - 1];
      expect(sql).toContain('UPDATE agent_cards');
      expect(sql).toContain('SET deleted_at = NOW()');
      expect(sql).toContain('WHERE id = $1 AND deleted_at IS NULL');
      expect(params).toEqual(['agent:echo']);
    });

    test('returns null when the card was already deleted', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      const result = await deleteAgentCard('agent:ghost');
      expect(result).toBeNull();
    });
  });

  // ---- upsertSystemAgentCard -------------------------------------------

  describe('upsertSystemAgentCard', () => {
    test('inserts or refreshes a system card without an owner', async () => {
      const upserted = { id: 'agent:nexus', version: '1.0.0' };
      query.mockResolvedValueOnce({ rows: [upserted] });
      const card = await upsertSystemAgentCard({
        id: 'agent:nexus',
        name: 'Nexus',
        description: 'Database custodian',
        skills: [],
        visibility: 'public',
      });
      expect(card).toEqual(upserted);
      const [sql, params] = query.mock.calls[query.mock.calls.length - 1];
      expect(sql).toContain('INSERT INTO agent_cards');
      expect(sql).toContain('ON CONFLICT (id) DO UPDATE');
      expect(sql).toContain('deleted_at = NULL');
      expect(params[0]).toBe('agent:nexus');
      // System cards always have NULL owner_id and NULL workspace_id.
      expect(params).toContain(null);
    });

    test('rejects an invalid visibility', async () => {
      await expect(upsertSystemAgentCard({
        id: 'a', name: 'A', description: 'd', visibility: 'global',
      })).rejects.toThrow(/visibility must be one of/);
    });
  });
});
