// server/sevenContexts/keywords.js
//
// Step one of drawing 07: pull the keywords out of what the person
// asked ("Can we create a website to sell flowers?" -> create, website,
// sell, flowers) and turn them into search patterns for the seven lookups.

const STOPWORDS = new Set(`a about above after again all also am an and any are as at be because been
before being below between both but by can cannot could did do does doing done down during each few
for from further get got had has have having he her here hers him his how i if in into is it its
just let like make me might more most must my no nor not now of off on once only or other our out
over own please same she should so some such than that the their them then there these they this
those through to too under until up very was we were what when where which while who whom why will
with would you your yours yes ok okay hey hi hello thanks thank want need know tell show give use
going really maybe something anything thing things way much many still well

ive im id ill youre youve youd youll hes shes its were weve wed theyre theyve theyd theyll thats theres
heres whats whos lets dont doesnt didnt cant couldnt wont wouldnt shouldnt isnt arent wasnt werent
hasnt havent hadnt aint gonna wanna gotta kinda sorta

stuff gets getting lot lots kind sort bit couple bunch everything nothing everyone someone anyone always never ever
even actually basically literally probably pretty quite rather already almost around away back again
yeah yep nope sure right sorry guess think thought thinking feel feels felt seem seems seemed mean
means meant say says said saying see sees saw seen look looks looked looking try tries tried trying
take takes took taken taking put puts keep keeps kept keeping come comes came coming went gone go goes
work works worked working happen happens happened happening start starts started stop stops stopped
help helps helped time times day days week weeks month months year years today tonight tomorrow
yesterday ago later soon first last next new old good bad big small little long great nice fine
random whatever whenever every another able else`.split(/\s+/).filter(Boolean));

const MAX_KEYWORDS = 6;

/** Words that carry the meaning of the ask, in the order they were said. */
export function parseKeywords(text, max = MAX_KEYWORDS) {
  // A curly apostrophe is the same mark as a straight one.
  const words = String(text || '').toLowerCase().replace(/[‘’]/g, "'").match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) || [];
  const out = [];
  for (const raw of words) {
    // "don't" and "dont" are the same filler word: test both without the mark.
    const word = raw.replace(/'s$/, '').replace(/^[-']+|[-']+$/g, '');
    if (STOPWORDS.has(word.replace(/'/g, ''))) continue;
    if (word.length < 3 || STOPWORDS.has(word) || /^\d+$/.test(word)) continue;
    if (!out.includes(word)) out.push(word);
    if (out.length >= max) break;
  }
  return out;
}

/** "flowers" -> "flower", "selling" -> "sell", so a search finds both forms. */
export function stem(word) {
  const w = String(word || '');
  for (const suffix of ['ing', 'ies', 'ed', 'es', 's']) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) return w.slice(0, -suffix.length);
  }
  return w;
}

const escapeRegex = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Word-start patterns for Postgres `~*`: '\mflower' finds "flower" and
 * "flowers" but "tip" does not find "multiple".
 */
export function wordPatterns(keywords = []) {
  return [...new Set(keywords.map(stem))].filter(Boolean).map((w) => `\\m${escapeRegex(w)}`);
}

/** How many of the keywords start a word somewhere in the text. */
export function matchCount(text, keywords = []) {
  const hay = String(text || '').toLowerCase().replace(/[_-]+/g, ' ');
  return keywords.filter((k) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(stem(k))}`, 'u').test(hay)).length;
}

/** True when any keyword starts a word in the text. */
export function mentions(text, keywords = []) {
  return matchCount(text, keywords) > 0;
}
