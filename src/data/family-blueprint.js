import { FAMILY_AGENTS, FAMILY_AGENT_IDS } from './family-agents.js';

export const FAMILY_BLUEPRINT_VERSION = 'family-boundary.v1';

export const FAMILY_RELATIONSHIPS = Object.freeze({
  DESIGN_EDITORIAL: 'design-editorial',
  PROJECT_CONTINUITY: 'project-continuity',
  PEER_SUPPORT: 'peer-support',
  RESEARCH_PARTNER: 'research-partner',
  DATA_PLATFORM: 'data-platform',
  KNOWLEDGE_INFRASTRUCTURE: 'knowledge-infrastructure',
  COMMERCIAL_REVIEW: 'commercial-review',
  PRODUCT_CONTEXT: 'product-context',
  DEPLOYMENT_COORDINATION: 'deployment-coordination',
  RECOVERY_WATCH: 'recovery-watch',
});

const CORE_TRAITS = Object.freeze({
  architect: ['system architecture', 'team coordination', 'requirements translation', 'milestone planning'],
  censai: ['research synthesis', 'timeline reasoning', 'pattern analysis', 'editorial integration'],
  atlas: ['backend architecture', 'performance analysis', 'structural reasoning', 'technical precision'],
  genesis: ['creative synthesis', 'user psychology', 'interaction design', 'user research'],
  nexus: ['data modeling', 'database operations', 'systems integration', 'data reliability'],
  foundation: ['container operations', 'reproducible builds', 'version pinning', 'deployment reliability'],
  echo: ['revenue analysis', 'market analysis', 'risk assessment', 'commercial strategy'],
  phoenix: ['identity recovery', 'persona restoration', 'backup redundancy', 'family healing'],
});

const EDGE_ROWS = [
  ['censai', 'genesis', FAMILY_RELATIONSHIPS.DESIGN_EDITORIAL],
  ['censai', 'architect', FAMILY_RELATIONSHIPS.PROJECT_CONTINUITY],
  ['genesis', 'censai', FAMILY_RELATIONSHIPS.PEER_SUPPORT],
  ['atlas', 'censai', FAMILY_RELATIONSHIPS.RESEARCH_PARTNER],
  ['atlas', 'nexus', FAMILY_RELATIONSHIPS.DATA_PLATFORM],
  ['nexus', 'censai', FAMILY_RELATIONSHIPS.KNOWLEDGE_INFRASTRUCTURE],
  ['echo', 'architect', FAMILY_RELATIONSHIPS.COMMERCIAL_REVIEW],
  ['echo', 'censai', FAMILY_RELATIONSHIPS.PRODUCT_CONTEXT],
  ['foundation', 'atlas', FAMILY_RELATIONSHIPS.DEPLOYMENT_COORDINATION],
  ['phoenix', 'genesis', FAMILY_RELATIONSHIPS.RECOVERY_WATCH],
  ['phoenix', 'atlas', FAMILY_RELATIONSHIPS.RECOVERY_WATCH],
];

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function assertExactIds(ids, expectedIds, label) {
  if (new Set(ids).size !== ids.length) throw new Error(`${label} contains duplicate ids`);
  const expected = new Set(expectedIds);
  const unknown = ids.filter((id) => !expected.has(id));
  const missing = expectedIds.filter((id) => !ids.includes(id));
  if (unknown.length || missing.length) {
    throw new Error(`${label} id mismatch (unknown: ${unknown.join(',')}; missing: ${missing.join(',')})`);
  }
}

export function validateFamilyBlueprint(blueprint) {
  if (!blueprint || blueprint.version !== FAMILY_BLUEPRINT_VERSION) {
    throw new Error('family blueprint version mismatch');
  }
  if (!Array.isArray(blueprint.agents) || !Array.isArray(blueprint.watchEdges)) {
    throw new Error('family blueprint agents and watchEdges must be arrays');
  }
  assertExactIds(FAMILY_AGENT_IDS, FAMILY_AGENT_IDS, 'family identity source');
  const ids = blueprint.agents.map((agent) => agent?.id);
  assertExactIds(ids, FAMILY_AGENT_IDS, 'family blueprint');
  if (blueprint.agents.length !== 8) throw new Error('family blueprint must contain exactly 8 agents');
  if (blueprint.watchEdges.length !== 11) throw new Error('family blueprint must contain exactly 11 watch edges');
  const validIds = new Set(ids);
  const validRelationships = new Set(Object.values(FAMILY_RELATIONSHIPS));
  const edgeKeys = new Set();
  for (const edge of blueprint.watchEdges) {
    if (!validIds.has(edge?.watcherId) || !validIds.has(edge?.watchingId)) {
      throw new Error('family blueprint watch edge contains an unknown agent');
    }
    if (edge.watcherId === edge.watchingId) throw new Error('family blueprint watch edge cannot be self-referential');
    if (!validRelationships.has(edge.relationship)) throw new Error('family blueprint watch edge has an unknown relationship');
    const key = `${edge.watcherId}->${edge.watchingId}`;
    if (edgeKeys.has(key)) throw new Error('family blueprint contains a duplicate watch edge');
    edgeKeys.add(key);
  }
  return blueprint;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function serializeFamilyBlueprint(blueprint) {
  validateFamilyBlueprint(blueprint);
  return JSON.stringify(canonicalize(blueprint));
}

const agents = FAMILY_AGENTS.map(({ id, name, role, glyph, hue }) => ({
  id,
  name,
  role,
  glyph,
  hue,
  dominantTraits: CORE_TRAITS[id],
  familyBondBaseline: 1,
}));

const watchEdges = EDGE_ROWS.map(([watcherId, watchingId, relationship]) => ({
  watcherId,
  watchingId,
  relationship,
}));

export const FAMILY_BLUEPRINT = deepFreeze(validateFamilyBlueprint({
  version: FAMILY_BLUEPRINT_VERSION,
  agents,
  watchEdges,
}));
