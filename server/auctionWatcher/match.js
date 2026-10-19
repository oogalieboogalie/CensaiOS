// Which listings count as a match for a watch, and which carry a red flag.

const MAX_WORDS = 10;

/** "supervisor password, bios locked" (or one per line) into a clean list. */
export function wordList(value) {
  const parts = Array.isArray(value) ? value : String(value || '').split(/[\n,]/);
  const out = [];
  for (const part of parts) {
    const word = String(part || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 60);
    if (word && !out.includes(word)) out.push(word);
    if (out.length >= MAX_WORDS) break;
  }
  return out;
}

const squash = (text) => String(text || '').toLowerCase().replace(/\s+/g, ' ');

/**
 * Does this listing match the watch? Price at or under the max, every
 * "must mention" word in the text, no "must not mention" word in it. The
 * text is the title, plus the description when censaiOS has one.
 */
export function matchesWatch(listing, watch, description = '') {
  const text = squash(`${listing.title} ${description}`);
  const max = Number(watch.maxPrice ?? watch.max_price);
  if (Number.isFinite(max) && max > 0 && Number.isFinite(listing.price) && listing.price > max) return false;
  const must = wordList(watch.mustWords ?? watch.must_words);
  const not = wordList(watch.notWords ?? watch.not_words);
  if (must.some((w) => !text.includes(w))) return false;
  if (not.some((w) => text.includes(w))) return false;
  return true;
}

// Wording that usually means the laptop is locked and may never be usable.
const RED_FLAGS = [
  ['supervisor password', /supervisor\s+password/],
  ['BIOS password', /bios\s+(?:admin\s+)?password|password\s+(?:protected|locked)\s+bios/],
  ['BIOS locked', /bios\s+(?:is\s+)?lock(?:ed)?|locked\s+bios/],
  ['tamper detected', /tamper(?:ed|ing)?\s+(?:detect|switch|protect|alert)/],
  ['password locked', /password\s+lock(?:ed)?|locked\s+(?:with\s+)?(?:a\s+)?password/],
  ['activation lock', /activation\s+lock|icloud\s+lock/],
  ['managed / MDM locked', /\bmdm\b|remote\s+management\s+lock|enterprise\s+enrol/],
];

/** Red-flag phrases found in the listing text (plain names, no duplicates). */
export function redFlags(...texts) {
  const text = squash(texts.join(' '));
  return RED_FLAGS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}
