// server/agentMemory/searchTerms.js
//
// Plain words to an "any of these words" search, safe for to_tsquery.
// Shared by episodes (store.js) and the saved messages (turns.js).

export function searchTerms(text, max = 12) {
  const words = String(text || '').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
  return [...new Set(words)].slice(0, max).join(' | ');
}
