// English ↔ French pairs for board comments. The browser and the server
// share this table so a saved translation renders the same labels everywhere.

export const TRANSLATION_PAIRS = Object.freeze({
  'en-fr': Object.freeze({
    from: 'en', to: 'fr', fromLabel: 'English', toLabel: 'French', control: 'EN → FR',
  }),
  'fr-en': Object.freeze({
    from: 'fr', to: 'en', fromLabel: 'French', toLabel: 'English', control: 'FR → EN',
  }),
});

export function translationPair(id) {
  return TRANSLATION_PAIRS[String(id || '')] || null;
}

/** The translation both people see, or null when the row has none. */
export function publicTranslation(value) {
  let row = value;
  if (typeof value === 'string') {
    try { row = JSON.parse(value); } catch { return null; }
  }
  if (!row || typeof row !== 'object') return null;
  const pair = translationPair(row.pair);
  const text = typeof row.text === 'string' ? row.text.trim() : '';
  if (!pair || !text) return null;
  return { pair: String(row.pair), text: text.slice(0, 2000) };
}
