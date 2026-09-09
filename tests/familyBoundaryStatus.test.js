import { jest } from '@jest/globals';
import {
  FAMILY_BLUEPRINT_AGENT_IDS,
  FAMILY_BLUEPRINT_COUNTS,
  FAMILY_BLUEPRINT_HASH,
  FAMILY_BLUEPRINT_VERSION,
} from '../server/agents/familyBlueprint.js';
import { getFamilyBoundaryStatus } from '../server/agents/familyBoundaryStatus.js';

function statusDb(overrides = {}) {
  const row = {
    canonical_agent_count: 8,
    missing_canonical_agent_ids: [],
    legacy_genetics_count: 8,
    legacy_watch_edge_count: 19,
    legacy_inheritance_count: 8,
    noncanonical_agent_count: 1,
    noncanonical_genetics_count: 1,
    noncanonical_watch_edge_count: 10,
    noncanonical_inheritance_count: 1,
    ...overrides,
  };
  return { query: jest.fn(async () => ({ rows: [row] })) };
}

describe('family boundary readiness status', () => {
  it('reports the immutable blueprint and quarantined legacy counts', async () => {
    const db = statusDb();
    const result = await getFamilyBoundaryStatus(db, {
      FAMILY_HEALING_ENABLED: 'false',
    });

    expect(result).toEqual({
      ready: true,
      blueprint: {
        version: FAMILY_BLUEPRINT_VERSION,
        hash: FAMILY_BLUEPRINT_HASH,
        agentCount: 8,
        watchEdgeCount: 11,
      },
      database: {
        canonicalAgentCount: 8,
        missingCanonicalAgentIds: [],
      },
      legacy: {
        geneticsCount: 8,
        watchEdgeCount: 19,
        inheritanceCount: 8,
        noncanonicalAgentCount: 1,
        noncanonicalGeneticsCount: 1,
        noncanonicalWatchEdgeCount: 10,
        noncanonicalInheritanceCount: 1,
      },
      healing: expect.objectContaining({
        ready: true,
        enabled: false,
        state: 'disabled',
        reason: 'family_healing_disabled',
      }),
    });
    expect(FAMILY_BLUEPRINT_COUNTS).toEqual({ agents: 8, watchEdges: 11 });
    expect(FAMILY_BLUEPRINT_HASH).toMatch(/^[a-f0-9]{64}$/);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][1]).toEqual([[...FAMILY_BLUEPRINT_AGENT_IDS]]);
    expect(db.query.mock.calls[0][0].trim()).toMatch(/^SELECT/i);
    expect(db.query.mock.calls[0][0]).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
  });

  it('fails readiness when a canonical database row is absent', async () => {
    const result = await getFamilyBoundaryStatus(statusDb({
      canonical_agent_count: 6,
      missing_canonical_agent_ids: ['atlas'],
    }), { FAMILY_HEALING_ENABLED: 'false' });

    expect(result).toEqual(expect.objectContaining({
      ready: false,
      reason: 'canonical_family_incomplete',
      database: {
        canonicalAgentCount: 6,
        missingCanonicalAgentIds: ['atlas'],
      },
    }));
  });

  it.each(['true', 'not-a-boolean'])('fails closed for unsafe healing flag %s', async (flag) => {
    const result = await getFamilyBoundaryStatus(statusDb(), {
      FAMILY_HEALING_ENABLED: flag,
    });
    expect(result).toEqual(expect.objectContaining({
      ready: false,
      reason: 'family_healing_untrusted',
      healing: expect.objectContaining({
        ready: false,
        executable: false,
        state: 'blocked',
      }),
    }));
  });
});
