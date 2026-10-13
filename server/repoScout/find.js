// "Where do I change X?": the map finds the likely places for free, then the
// scout's small model picks the exact file, line and column and says why.
// The answer also lists the files that use that file, so the core agent
// knows what else the change can touch. The scout only points; the core
// agent makes the edit.

import fs from 'node:fs';
import path from 'node:path';
import { describeFile, findCandidates } from './query.js';
import { buildScoutMessages, parseScoutAnswer } from './scoutModel.js';

function fromMap(candidate, words) {
  return {
    file: candidate.path,
    line: candidate.line,
    column: candidate.column,
    reason: `The map matched ${candidate.matched.join(', ')} here${candidate.symbol ? `, inside ${candidate.symbol}` : ''}.`,
    confidence: candidate.matched.length >= Math.min(2, words.length) ? 'medium' : 'low',
  };
}

function checkPick(map, pick, candidates) {
  if (!pick) return null;
  const node = map.files.get(pick.file) || map.files.get(pick.file.replace(/^\.?\//, ''));
  if (!node || !candidates.some((c) => c.path === node.path)) return null;
  if (!pick.line || pick.line < 1 || pick.line > node.lines) return null;
  return { ...pick, file: node.path };
}

/**
 * @param map      from getRepoMap
 * @param request  the change, in plain words
 * @param complete optional (messages) => text, the scout's model
 */
export async function findWhereToChange(map, request, { complete = null, modelLabel = null } = {}) {
  const { words, candidates } = await findCandidates(map, request);
  if (!candidates.length) {
    return { found: false, words, candidates, note: words.length
      ? `Nothing in the map mentions ${words.join(', ')}.`
      : 'Say what should change in a few more words.' };
  }
  let pick = null;
  let pickedBy = 'map';
  let modelError = null;
  if (complete) {
    try {
      pick = checkPick(map, parseScoutAnswer(await complete(buildScoutMessages(request, candidates))), candidates);
      if (pick) pickedBy = 'model';
      else modelError = 'The scout model gave an answer outside the places it was shown, so the map\'s best match is used.';
    } catch (error) {
      modelError = `The scout model did not answer (${String(error.message || error).slice(0, 160)}), so the map's best match is used.`;
    }
  }
  if (!pick) pick = fromMap(candidates[0], words);
  const chosen = candidates.find((c) => c.path === pick.file) || candidates[0];
  const text = pick.line === chosen.line ? chosen.text : await fs.promises.readFile(path.join(map.root, pick.file), 'utf8')
    .then((content) => (content.split(/\r?\n/)[pick.line - 1] || '').trim().slice(0, 200)).catch(() => null);
  const impact = describeFile(map, pick.file);
  return {
    found: true,
    words,
    ...pick,
    lineText: text,
    pickedBy,
    model: pickedBy === 'model' ? modelLabel : null,
    modelError,
    alsoCheck: { usedBy: impact.usedBy, usedByIndirectly: impact.usedByIndirectly.slice(0, 15), tests: impact.tests },
    candidates: candidates.map(({ path, line, column, score, matched, symbol }) => ({ path, line, column, score, matched, symbol })),
  };
}
