import { jest } from '@jest/globals';
import {
  DefinitionSelectionError,
  saveDefinitionIds,
  validateDefinitionIds,
} from '../server/attributes/selection.js';
import { REVIEWED_MINDSET_SOURCES } from '../server/attributes/reviewedMindsetSources.js';

function createPool(query) {
  const client = { query, release: jest.fn() };
  return { pool: { connect: jest.fn().mockResolvedValue(client) }, client };
}

const scope = { workspaceId: 'workspace-1', userId: 7 };
const reviewedId = 'mindset_strategic_foresight';
const reviewedSource = REVIEWED_MINDSET_SOURCES[reviewedId];
const reviewedRow = {
  id: reviewedId,
  type: 'mindset',
  validation: {
    source: reviewedSource.source,
    source_family: reviewedSource.sourceFamily,
    report: reviewedSource.report,
    issues: reviewedSource.issues.map(([number]) => number),
  },
};

describe('attribute and mindset selection validation', () => {
  test('rejects malformed inputs before opening a transaction', async () => {
    const { pool } = createPool(jest.fn());
    await expect(saveDefinitionIds(pool, 'atlas', 'not-an-array', 'attribute', scope))
      .rejects.toBeInstanceOf(DefinitionSelectionError);
    await expect(saveDefinitionIds(pool, 'atlas', ['x', 'x'], 'mindset', scope))
      .rejects.toThrow('must be unique');
    expect(pool.connect).not.toHaveBeenCalled();
    expect(validateDefinitionIds([])).toEqual([]);
  });

  test('validates every ID before deleting the existing selection', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [reviewedRow] })
      .mockResolvedValueOnce({});
    const { pool, client } = createPool(query);
    await expect(saveDefinitionIds(pool, 'atlas', [reviewedId, 'missing'], 'mindset', scope))
      .rejects.toThrow('Unknown, inactive, or unreviewed mindset IDs: missing');
    expect(client.query.mock.calls[1][0]).toContain('pg_advisory_xact_lock');
    expect(client.query.mock.calls[1][1]).toEqual(['["workspace-1","atlas","mindset"]']);
    expect(client.query.mock.calls[2][0]).toContain('SELECT id,type,validation FROM attribute_definitions');
    expect(client.query).toHaveBeenNthCalledWith(4, 'ROLLBACK');
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM'))).toBe(false);
  });

  test('persists a validated mindset selection atomically', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [reviewedRow] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const { pool, client } = createPool(query);
    await saveDefinitionIds(pool, 'atlas', [reviewedId], 'mindset', scope);
    expect(client.query.mock.calls[1][0]).toContain('pg_advisory_xact_lock');
    expect(client.query.mock.calls[2][0]).toContain('SELECT id,type,validation');
    expect(client.query.mock.calls[3][0]).toContain('DELETE FROM workspace_agent_equipped_items');
    expect(client.query.mock.calls[3][1]).toEqual(['workspace-1', 'atlas', 'mindset']);
    expect(client.query.mock.calls[4][1]).toEqual(['workspace-1', 'atlas', 7, [reviewedId]]);
    expect(client.query).toHaveBeenNthCalledWith(6, 'COMMIT');
  });

  test('rolls back when persistence fails after validation', async () => {
    const writeFailure = Object.assign(new Error('write failed'), { code: 'XX001' });
    const query = jest.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'meticulous' }] })
      .mockRejectedValueOnce(writeFailure)
      .mockResolvedValueOnce({});
    const { pool, client } = createPool(query);
    await expect(saveDefinitionIds(pool, 'atlas', ['meticulous'], 'attribute', scope))
      .rejects.toBe(writeFailure);
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  test('rejects unscoped or non-canonical writes before opening a transaction', async () => {
    const { pool } = createPool(jest.fn());
    await expect(saveDefinitionIds(pool, 'atlas', [], 'mindset'))
      .rejects.toMatchObject({ code: 'AGENT_CONFIGURATION_SCOPE_REQUIRED' });
    await expect(saveDefinitionIds(pool, 'atlas-1', [], 'mindset', scope))
      .rejects.toMatchObject({ code: 'AGENT_CONFIGURATION_UNSUPPORTED_AGENT', statusCode: 422 });
    expect(pool.connect).not.toHaveBeenCalled();
  });
});
