// Pure: rank a board's blueprints against the words left after a
// "Do we have ..." phrase. Title, type and purpose count more than the steps;
// an exact ID wins outright. No words left ("Do we have any blueprints?")
// means the whole shelf, newest first.
import { parseBlueprintId, shelfName } from './blueprintIds.js';

const WEIGHTS = { id: 100, title: 4, type: 4, purpose: 3, shelf: 3, body: 1 };

function fieldsOf(blueprint) {
  return {
    id: String(blueprint.id || '').toLowerCase(),
    title: String(blueprint.title || '').toLowerCase(),
    type: String(blueprint.type || '').toLowerCase(),
    purpose: String(blueprint.purpose || '').toLowerCase(),
    shelf: shelfName(blueprint.shelf ?? parseBlueprintId(blueprint.id)?.shelf).toLowerCase(),
    body: String(blueprint.body || '').toLowerCase(),
  };
}

export function scoreBlueprint(blueprint, words) {
  const fields = fieldsOf(blueprint);
  let score = 0;
  for (const word of words) {
    if (fields.id && word === fields.id) score += WEIGHTS.id;
    for (const key of ['title', 'type', 'purpose', 'shelf', 'body']) {
      if (fields[key].includes(word)) score += WEIGHTS[key];
    }
  }
  return score;
}

export function rankBlueprints(blueprints, words, limit = 8) {
  const list = Array.isArray(blueprints) ? blueprints : [];
  if (!words?.length) return list.slice(0, limit);
  return list
    .map((blueprint, index) => ({ blueprint, index, score: scoreBlueprint(blueprint, words) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((row) => row.blueprint);
}

/** The drawing's code view: blueprint: ID, type, purpose. */
export function blueprintCodeView(blueprint) {
  return [
    'blueprint:',
    `  ID: ${JSON.stringify(String(blueprint.id || ''))},`,
    `  type: ${JSON.stringify(String(blueprint.type || ''))},`,
    `  purpose: ${JSON.stringify(String(blueprint.purpose || ''))}`,
  ].join('\n');
}
