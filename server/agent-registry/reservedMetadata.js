const RESERVED_KEYS = new Set(['executor', 'import']);

export function sanitizeUserCardMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !RESERVED_KEYS.has(key)));
}

export function sanitizeUserCardPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const sanitized = { ...patch };
  if (Object.prototype.hasOwnProperty.call(sanitized, 'metadata')) {
    sanitized.metadata = sanitizeUserCardMetadata(sanitized.metadata);
  }
  return sanitized;
}
