// Plain memory scoring for the open source build: every memory starts at the
// same importance and recall order comes from matching words, meaning and age.
import { createHash } from 'crypto';

function normalizeContent(content) {
  if (content == null) return '';
  return typeof content === 'string' ? content : String(content);
}

export function calculateImportance() {
  return 0.5;
}

export function calculateEmotionalWeight() {
  return 0;
}

export function quantumSignature(content) {
  return createHash('sha256').update(normalizeContent(content)).digest('hex').slice(0, 16);
}

export const MEMORY_ORDER_SQL = 'importance';

// The notes carried in an agent's instructions: the newest keep a third of the
// places, so old notes cannot keep every new one out.
export function recentPlaces(limit) {
  return Math.ceil(Math.max(Number(limit) || 0, 0) / 3);
}

/** `where` picks the notes ($1 and $3 are its own); $2 is how many, $4 how many places the newest get. */
export function topNotesSql(where) {
  return `SELECT content, memory_type, importance, emotional_weight FROM (
       SELECT content, memory_type, importance, emotional_weight, last_accessed,
              row_number() OVER (ORDER BY created_at DESC, id DESC) AS newest
         FROM memories WHERE ${where}
     ) notes
     ORDER BY (newest <= $4) DESC, ${MEMORY_ORDER_SQL} DESC, last_accessed DESC LIMIT $2`;
}

export function combinedMemoryScore({ importance = 0, lexical = null, semantic = 0 } = {}) {
  const base = Number(importance || 0) * 0.2;
  if (lexical === null) return base + Number(semantic || 0) * 0.8;
  return base + Number(lexical || 0) * 0.4 + Number(semantic || 0) * 0.4;
}
