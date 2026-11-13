// Picks the best answer in one arena race from what was asked and how fast
// it finished. A prettier page does not score. No React and no network.
// Not src/lib/modelStrengths/autoPick.js, which chooses a model to call.
import { CUT_OFF_REASONS, estimateCost } from './arenaCatalog.js';

export const AUTO_REASON_LIMIT = 240;

const FILLER = new Set(['can', 'you', 'make', 'me', 'a', 'the', 'please', 'form', 'that', 'says', 'and']);
const LOOKS = 'Looks are not part of this.';

const finite = (value) => (Number.isFinite(value) ? value : Number.POSITIVE_INFINITY);

function addThing(things, seen, raw) {
  const thing = String(raw || '').replace(/\s+/g, ' ').trim().replace(/[:\s]+$/, '');
  if (thing.length < 2) return;
  const key = thing.toLowerCase();
  if (seen.has(key)) return;
  const words = key.split(/[^a-z0-9-]+/).filter(Boolean);
  if (!words.length || words.every((word) => FILLER.has(word))) return;
  seen.add(key);
  things.push(thing);
}

function sentenceStart(text, index) {
  const before = text.slice(0, index).trim();
  return before === '' || /[.!?]$/.test(before);
}

// A capital that opens a sentence is usually the verb ("Build a form").
// It still counts when it opens a list of labels ("Username and Password").
function countsAsLabel(text, word, index) {
  if (!sentenceStart(text, index)) return true;
  const after = text.slice(index + word.length);
  return /^\s+and\s+[A-Z]/.test(after) || /^\s*,\s*[A-Z]/.test(after);
}

/** Quoted phrases, words before a colon, and Capitalized labels. Filler is dropped. */
export function namedThings(request) {
  const text = String(request || '');
  const things = [];
  const seen = new Set();
  const add = (raw) => addThing(things, seen, raw);
  const masked = text.replace(/"([^"]*)"|'([^']*)'/g, (full, quoted, single) => {
    add(quoted ?? single);
    return ' '.repeat(full.length);
  });
  const colon = /([A-Za-z][A-Za-z0-9-]*)\s*:(?!\/)/g;
  let match;
  while ((match = colon.exec(masked))) add(match[1]);
  const capital = /\b[A-Z][A-Za-z0-9-]*\b/g;
  while ((match = capital.exec(masked))) {
    if (countsAsLabel(masked, match[0], match.index)) add(match[0]);
  }
  return things;
}

function finishedAnswer(result) {
  return result?.status === 'done'
    && !CUT_OFF_REASONS.has(result.finishReason)
    && String(result.text || '').trim() !== '';
}

function costOf(lane, result) {
  const cost = estimateCost(lane?.provider, lane?.model, result?.usage);
  return Number.isFinite(cost) ? cost : Number.POSITIVE_INFINITY;
}

function bySpeed(a, b) {
  return finite(a.result.totalMs) - finite(b.result.totalMs)
    || finite(a.result.firstTokenMs) - finite(b.result.firstTokenMs)
    || (a.cost - b.cost)
    || (a.index - b.index);
}

function joinNames(names) {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function speedWords(winner, group) {
  const others = group.filter((entry) => entry.index !== winner.index);
  const slowerFinish = (entry) => finite(entry.result.totalMs) > finite(winner.result.totalMs);
  if (others.every(slowerFinish)) return 'it finished first';
  const answeredFirst = (entry) => slowerFinish(entry) || finite(entry.result.firstTokenMs) > finite(winner.result.firstTokenMs);
  if (others.every(answeredFirst)) return 'it answered first';
  if (others.every((entry) => entry.cost > winner.cost)) return 'it costs less';
  return 'it is the earlier one';
}

function say(body) {
  return `Picked automatically: ${body} ${LOOKS}`.slice(0, AUTO_REASON_LIMIT);
}

/**
 * The lane that should be marked best, or null when nothing finished.
 * Among answers that include every named thing, the fastest finish wins.
 */
export function autoPickArena({ prompt = '', lanes = [], results = [] } = {}) {
  const list = Array.isArray(lanes) ? lanes : [];
  const ready = (Array.isArray(results) ? results : []).map((result, index) => ({
    index,
    result,
    cost: costOf(list[index], result),
  })).filter((entry) => finishedAnswer(entry.result));
  if (!ready.length) return { best: null, reason: 'Nothing finished, so nothing was picked.' };

  const things = namedThings(prompt);
  const winnerOf = (group) => [...group].sort(bySpeed)[0];
  if (!things.length) {
    const winner = winnerOf(ready);
    const speed = speedWords(winner, ready);
    const body = speed === 'it finished first'
      ? 'nothing concrete was named, so the fastest finish wins.'
      : `nothing concrete was named, and ${speed}.`;
    return { best: winner.index, reason: say(body) };
  }

  const covers = (entry) => things.filter((thing) => String(entry.result.text).toLowerCase().includes(thing.toLowerCase()));
  const ranked = ready.map((entry) => ({ ...entry, hit: covers(entry) }));
  const most = Math.max(...ranked.map((entry) => entry.hit.length));
  const group = ranked.filter((entry) => entry.hit.length === most);
  const winner = winnerOf(group);
  const speed = speedWords(winner, group);
  if (most === things.length) {
    const body = group.length === 1
      ? `it includes ${joinNames(things)}, and no other finished answer did.`
      : `it includes ${joinNames(things)}, and ${speed}.`;
    return { best: winner.index, reason: say(body) };
  }
  if (most === 0) {
    return { best: winner.index, reason: say('none of the answers included what was asked, so the fastest finish wins.') };
  }
  return {
    best: winner.index,
    reason: say(`it includes ${joinNames(winner.hit)}, the most of what was asked, and ${speed} among those.`),
  };
}

/** Marks for a fresh finish. Null when a person already chose, or a pick is already stored. */
export function applyAutoPick(marks, pick) {
  if (!marks || marks.auto || marks.best !== null) return null;
  const best = Number.isInteger(pick?.best) ? pick.best : null;
  return {
    ...marks,
    best,
    auto: { best, reason: String(pick?.reason || '').slice(0, AUTO_REASON_LIMIT) },
  };
}

/** True while the automatic pick is still the current best and Best has not been clicked. */
export function autoPickStands(marks, index) {
  const auto = marks?.auto;
  if (!auto || auto.overridden || typeof auto.best !== 'number' || marks.best !== auto.best) return false;
  return index === undefined || index === auto.best;
}

/** Keeps a stored automatic pick. Odd shapes are dropped, so old records still load. */
export function cleanAutoMark(auto, laneCount) {
  if (!auto || typeof auto !== 'object' || Array.isArray(auto)) return null;
  const best = Number.isInteger(auto.best) && auto.best >= 0 && auto.best < laneCount ? auto.best : null;
  const reason = typeof auto.reason === 'string' ? auto.reason.slice(0, AUTO_REASON_LIMIT) : '';
  if (!('best' in auto) && reason === '' && auto.overridden !== true) return null;
  return { best, reason, ...(auto.overridden === true ? { overridden: true } : {}) };
}
