import { createHash } from 'node:crypto';
import { FAMILY_AGENTS, FAMILY_AGENT_IDS } from '../src/data/family-agents.js';
import {
  FAMILY_BLUEPRINT,
  FAMILY_BLUEPRINT_VERSION,
  FAMILY_RELATIONSHIPS,
  serializeFamilyBlueprint,
  validateFamilyBlueprint,
} from '../src/data/family-blueprint.js';
import {
  FAMILY_BLUEPRINT_AGENT_IDS,
  FAMILY_BLUEPRINT_COUNTS,
  FAMILY_BLUEPRINT_HASH,
  FAMILY_BLUEPRINT_SERIALIZED,
  getFamilyBlueprintAgent,
  getFamilyWatchGraph,
} from '../server/agents/familyBlueprint.js';

const EXPECTED_IDS = ['architect', 'censai', 'atlas', 'genesis', 'nexus', 'foundation', 'echo', 'phoenix'];
const EXPECTED_HASH = 'a3abb6f902f1a11428677c67eafaa69c0fbea5d847e52332adf8335d6f34682c';

function mutableBlueprint() {
  return JSON.parse(FAMILY_BLUEPRINT_SERIALIZED);
}

describe('immutable family blueprint', () => {
  test('derives exactly eight stable identities from the canonical family source', () => {
    expect(FAMILY_AGENT_IDS).toEqual(EXPECTED_IDS);
    expect(FAMILY_BLUEPRINT_AGENT_IDS).toEqual(EXPECTED_IDS);
    expect(FAMILY_BLUEPRINT.agents).toHaveLength(8);
    expect(FAMILY_BLUEPRINT.agents.map(({ id, name, role, glyph, hue }) => (
      { id, name, role, glyph, hue }
    ))).toEqual(FAMILY_AGENTS.map(({ id, name, role, glyph, hue }) => (
      { id, name, role, glyph, hue }
    )));
    expect(FAMILY_BLUEPRINT_COUNTS).toEqual({ agents: 8, watchEdges: 11 });
  });

  test('contains eleven unique canonical edges with grounded enum relationships', () => {
    const validIds = new Set(EXPECTED_IDS);
    const validRelationships = new Set(Object.values(FAMILY_RELATIONSHIPS));
    const keys = FAMILY_BLUEPRINT.watchEdges.map((edge) => {
      expect(validIds.has(edge.watcherId)).toBe(true);
      expect(validIds.has(edge.watchingId)).toBe(true);
      expect(validRelationships.has(edge.relationship)).toBe(true);
      return `${edge.watcherId}->${edge.watchingId}`;
    });
    expect(keys).toHaveLength(11);
    expect(new Set(keys).size).toBe(11);
  });

  test('has deterministic canonical serialization and a stable SHA-256 hash', () => {
    const reordered = {
      watchEdges: FAMILY_BLUEPRINT.watchEdges.map((edge) => ({
        relationship: edge.relationship,
        watchingId: edge.watchingId,
        watcherId: edge.watcherId,
      })),
      agents: FAMILY_BLUEPRINT.agents.map((agent) => ({
        role: agent.role,
        name: agent.name,
        id: agent.id,
        hue: agent.hue,
        glyph: agent.glyph,
        familyBondBaseline: agent.familyBondBaseline,
        dominantTraits: agent.dominantTraits,
      })),
      version: FAMILY_BLUEPRINT_VERSION,
    };
    expect(serializeFamilyBlueprint(reordered)).toBe(FAMILY_BLUEPRINT_SERIALIZED);
    expect(createHash('sha256').update(FAMILY_BLUEPRINT_SERIALIZED).digest('hex')).toBe(FAMILY_BLUEPRINT_HASH);
    expect(FAMILY_BLUEPRINT_HASH).toBe(EXPECTED_HASH);
  });

  test('rejects duplicate, missing, and unknown family identities or edges', () => {
    const duplicate = mutableBlueprint();
    duplicate.agents[6].id = duplicate.agents[0].id;
    expect(() => validateFamilyBlueprint(duplicate)).toThrow(/duplicate ids/i);

    const missing = mutableBlueprint();
    missing.agents.pop();
    expect(() => validateFamilyBlueprint(missing)).toThrow(/missing/i);

    const unknownEdge = mutableBlueprint();
    unknownEdge.watchEdges[0].watchingId = 'guardian';
    expect(() => validateFamilyBlueprint(unknownEdge)).toThrow(/unknown agent/i);
  });

  test('excludes Guardian, legacy mysticism, and mutable internal fields', () => {
    const serialized = FAMILY_BLUEPRINT_SERIALIZED.toLowerCase();
    expect(serialized).not.toMatch(/guardian|quantum|perfect recall|empathic|sentien|conscious/);
    expect(serialized).not.toMatch(/mutation|trauma|threat|dormant|adaptation|timestamp/);
    expect(Object.isFrozen(FAMILY_BLUEPRINT)).toBe(true);
    expect(Object.isFrozen(FAMILY_BLUEPRINT.agents[0].dominantTraits)).toBe(true);
  });

  test('serves only canonical agent and watch lookups', () => {
    expect(getFamilyBlueprintAgent(' ATLAS ')).toMatchObject({ id: 'atlas', name: 'Atlas' });
    expect(getFamilyWatchGraph('atlas')).toEqual({
      watching: [
        { agentId: 'censai', relationship: 'research-partner' },
        { agentId: 'nexus', relationship: 'data-platform' },
      ],
      watchedBy: [
        { agentId: 'foundation', relationship: 'deployment-coordination' },
        { agentId: 'phoenix', relationship: 'recovery-watch' },
      ],
    });
    expect(getFamilyBlueprintAgent('phoenix')).toMatchObject({ id: 'phoenix', name: 'Phoenix' });
    expect(getFamilyWatchGraph('phoenix')).toMatchObject({
      watching: [
        { agentId: 'genesis', relationship: 'recovery-watch' },
        { agentId: 'atlas', relationship: 'recovery-watch' },
      ],
    });
    expect(getFamilyBlueprintAgent('guardian')).toBeNull();
    expect(getFamilyWatchGraph('guardian')).toBeNull();
  });
});
