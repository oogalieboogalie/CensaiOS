// Pure: the "dynamic rag phrases" from diagram 08. When someone asks
// "Do we have any budget blueprints?", the phrase is caught, the rest
// ("budget") becomes the search, and the matching blueprints are handed to
// the agent before it answers. A board can add its own phrases.

export const DEFAULT_BLUEPRINT_PHRASES = Object.freeze([
  'Do we have*',
  'Do we have any*',
  'Do you know*',
  'Can you see if we have*',
  'Do you know if we have*',
  'Can you see if there is any*',
  'Can you check*',
  'Will you check*',
  'Will you see if*',
  'Please see if',
  'See if there is any',
  'See if there are',
  'Are there any',
  'Could you see if',
  'What do we have for',
  'What do we know about',
]);

export const PHRASE_LIMITS = Object.freeze({ count: 60, length: 80 });

// Words that say "look on the shelf" rather than what to look for.
const FILLER = new Set([
  'a', 'an', 'the', 'any', 'some', 'we', 'us', 'our', 'you', 'i', 'me', 'my', 'have', 'has', 'got', 'is', 'are',
  'there', 'if', 'for', 'about', 'of', 'on', 'in', 'to', 'that', 'this', 'with', 'please', 'can', 'could',
  'check', 'see', 'know', 'do', 'does', 'what', 'one', 'ones', 'blueprint', 'blueprints', 'yet', 'already',
  'how', 'when', 'where', 'who', 'why', 'which', 'will', 'would', 'should', 'and', 'but', 'they', 'them', 'from',
  'into', 'your', 'ours', 'anything', 'something', 'stuff', 'thing', 'things', 'saved', 'made', 'written',
]);

const clean = (text) => String(text || '').toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
const bare = (phrase) => clean(phrase).replace(/\*+$/, '').trim();

/** One phrase per line, no duplicates, the * kept as written. */
export function normalizePhrases(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const phrase = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, PHRASE_LIMITS.length);
    const key = bare(phrase);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(phrase);
    if (out.length >= PHRASE_LIMITS.count) break;
  }
  return out;
}

/**
 * Find a phrase in a message, at the start or after a name ("Atlas, do we
 * have ..."). Returns { phrase, rest } for the longest phrase found, or null.
 */
export function matchBlueprintPhrase(message, phrases = DEFAULT_BLUEPRINT_PHRASES) {
  const text = clean(message);
  if (!text) return null;
  let best = null;
  for (const phrase of phrases) {
    const key = bare(phrase);
    if (!key) continue;
    const at = text.indexOf(key);
    if (at < 0) continue;
    const before = text.slice(0, at);
    const after = text.charAt(at + key.length);
    if (before && !/[,.!?:;]\s*$/.test(before) && !/^\S+\s$/.test(before)) continue;
    if (after && /[a-z0-9]/.test(after)) continue;
    if (!best || key.length > bare(best.phrase).length) {
      best = { phrase, rest: text.slice(at + key.length).replace(/^[\s,:-]+/, '').replace(/[?.!\s]+$/, '') };
    }
  }
  return best;
}

/** The words worth searching for: "any budget blueprints for 2026?" -> ["budget", "2026"]. */
export function blueprintSearchWords(rest) {
  return clean(rest).split(/[^a-z0-9*^'-]+/)
    .map((word) => word.replace(/^'+|'+$/g, '').replace(/'s$/, ''))
    .filter((word) => word && !FILLER.has(word) && (word.length > 2 || /^\d+$/.test(word)))
    .map((word) => {
      if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3); // properties -> propert (property too)
      return word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
    });
}
