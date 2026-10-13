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

export function combinedMemoryScore({ importance = 0, lexical = null, semantic = 0 } = {}) {
  const base = Number(importance || 0) * 0.2;
  if (lexical === null) return base + Number(semantic || 0) * 0.8;
  return base + Number(lexical || 0) * 0.4 + Number(semantic || 0) * 0.4;
}
