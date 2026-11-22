import pool from '../db.js';
import { resolveMemoryScope } from './tenancy.js';
import { CO_OCCURRENCE_START, CO_OCCURRENCE_STEP } from './associationStrength.js';

// ═══════════════════════════════════════════════════════════════════
//  ASSOCIATION WEB
// ═══════════════════════════════════════════════════════════════════

const sameConcept = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

// The table has no "one row per pair" rule, so a plain insert adds the same
// link again every time. Each direction is looked up first: `onRepeat` says
// what happens to a link that is already there ({ set, values }: values fill
// $5 onward).
async function writeLink(agentId, from, to, { strength, type, context, scope, onRepeat }) {
  const found = await pool.query(
    `UPDATE association_web SET ${onRepeat.set}
     WHERE agent_id = $1 AND concept_a = $2 AND concept_b = $3 AND workspace_id = $4
     RETURNING id`,
    [agentId, from, to, scope.workspaceId, ...onRepeat.values],
  );
  if (found?.rows?.length) return found.rows[0].id;
  const made = await pool.query(
    `INSERT INTO association_web (agent_id, concept_a, concept_b, strength, association_type, context,
       workspace_id, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [agentId, from, to, strength, type, context, scope.workspaceId, scope.userId],
  );
  return made?.rows?.[0]?.id;
}

async function linkBothWays(agentId, conceptA, conceptB, options) {
  // A thing linked to itself says nothing.
  if (sameConcept(conceptA, conceptB)) return undefined;
  const id = await writeLink(agentId, conceptA, conceptB, options);
  await writeLink(agentId, conceptB, conceptA, options);
  return id;
}

/** A link someone asked for. Saved again, it keeps the stronger of the two strengths. */
export async function addAssociation(agentId, conceptA, conceptB, strength = 0.5, type = 'semantic', context = null, scopeInput = {}) {
  const scope = resolveMemoryScope(scopeInput, { requireUser: true });
  if (sameConcept(conceptA, conceptB)) {
    // Said out loud, so whoever asked is not told a link was saved.
    throw Object.assign(new Error('A link needs two different things.'), { code: 'ASSOCIATION_SAME_THING', statusCode: 400 });
  }
  return linkBothWays(agentId, conceptA, conceptB, {
    strength, type, context, scope,
    onRepeat: { set: 'strength = GREATEST(strength, $5), association_type = $6', values: [strength, type] },
  });
}

export async function getAssociations(agentId, concept, limit = 20, scopeInput = {}) {
  const scope = resolveMemoryScope(scopeInput);
  const { rows } = await pool.query(
    `SELECT concept_b AS concept, strength, association_type FROM association_web
     WHERE agent_id = $1 AND concept_a = $2 AND workspace_id = $3
     ORDER BY strength DESC LIMIT $4`,
    [agentId, concept, scope.workspaceId, limit]
  );
  return rows;
}

export async function strengthenAssociation(agentId, conceptA, conceptB, boost = 0.05, scopeInput = {}) {
  const scope = resolveMemoryScope(scopeInput);
  await pool.query(
    `UPDATE association_web SET strength = LEAST(strength + $4, 1.0), access_count = access_count + 1
     WHERE agent_id = $1 AND concept_a = $2 AND concept_b = $3 AND workspace_id = $5`,
    [agentId, conceptA, conceptB, boost, scope.workspaceId]
  );
  await pool.query(
    `UPDATE association_web SET strength = LEAST(strength + $4, 1.0), access_count = access_count + 1
     WHERE agent_id = $1 AND concept_a = $3 AND concept_b = $2 AND workspace_id = $5`,
    [agentId, conceptA, conceptB, boost, scope.workspaceId]
  );
}

// Ordinary words that get a capital only because they start a sentence. They
// are never the name of a thing, so they are never a concept.
const NOT_CONCEPTS = new Set(`a about above after again all also although always am an and another any
anyone anything are as at back be because been before being below best better between both but by can
cannot could did do does doing done down during each either else even ever every everyone everything few
finally first for from further get got had has have having he hello her here hers hey hi him his how
however i if in instead into is it its just last later let like made make many maybe me might more most
much must my need never next no none nor not note nothing now of off ok okay on once one only or other
our out over own perhaps please same second see she should since so some someone something sometimes
soon still such sure thank thanks than that the their them then there these they thing things this
those though through to today together tomorrow too two under until up upon use used using very was we
well were what whatever when whenever where whether which while who whom whose why will with within
without would yes yesterday yet you your yours`.split(/\s+/));

const CONCEPT_WORD = "[A-Z][a-z]+(?![a-z]|['’](?:t|ll|re|ve|d|m)\\b)";
const CONCEPT_PATTERN = new RegExp(`\\b${CONCEPT_WORD}(?:[ \\t]${CONCEPT_WORD})*`, 'g');

/**
 * The named things in a note, in the order they appear, each once: runs of
 * capitalised words ("Indigo Labs"), without sentence-opening words like
 * "When" or "This" ("When Alma" is "Alma").
 */
export function extractConcepts(content) {
  // A name is words on one line (a line break ends it), and "Don't" is not
  // the name "Don": a word cut short by 't, 'll, 're, 've, 'd or 'm is skipped.
  const matches = String(content || '').match(CONCEPT_PATTERN) || [];
  const seen = new Set();
  const concepts = [];
  for (const match of matches) {
    const words = match.split(/\s+/);
    while (words.length && NOT_CONCEPTS.has(words[0].toLowerCase())) words.shift();
    const concept = words.join(' ');
    const key = concept.toLowerCase();
    if (concept.length <= 2 || concept.length >= 50 || seen.has(key)) continue;
    seen.add(key);
    concepts.push(concept);
  }
  return concepts;
}

// Auto-extract and link concepts from content
export async function autoAssociate(agentId, content, scopeInput = {}) {
  const scope = resolveMemoryScope(scopeInput, { requireUser: true });
  const concepts = extractConcepts(content);

  // Link consecutive concepts concurrently. A pair already linked grows
  // stronger, and only a pair seen in two notes reaches an agent's instructions.
  const promises = [];
  for (let i = 0; i < concepts.length - 1 && i < 5; i++) {
    promises.push(linkBothWays(agentId, concepts[i], concepts[i + 1], {
      strength: CO_OCCURRENCE_START, type: 'co-occurrence', context: null, scope,
      onRepeat: {
        set: 'strength = LEAST(strength + $5, 1.0), access_count = access_count + 1',
        values: [CO_OCCURRENCE_STEP],
      },
    }));
  }
  await Promise.all(promises);
}

// ═══════════════════════════════════════════════════════════════════
//  WATCH GRAPH + GENETICS
// ═══════════════════════════════════════════════════════════════════

export async function getWatchGraph(agentId) {
  const { rows: watching } = await pool.query(
    'SELECT watching, relationship FROM watch_graph WHERE watcher = $1', [agentId]
  );
  const { rows: watchedBy } = await pool.query(
    'SELECT watcher, relationship FROM watch_graph WHERE watching = $1', [agentId]
  );
  return { watching, watchedBy };
}

export async function addWatch(watcher, watching, relationship) {
  await pool.query(
    `INSERT INTO watch_graph (watcher, watching, relationship)
     VALUES ($1, $2, $3) ON CONFLICT (watcher, watching) DO UPDATE SET relationship = $3`,
    [watcher, watching, relationship]
  );
}

export { getGenetics, evolveTraits } from './genetics.js';
