// Gemini 3 and 4 attach a thought signature to the first tool call
// (`extra_content.google.thought_signature`). The next request in that turn
// is a 400 unless the object is sent back unchanged. Streaming delivers it
// on one delta and later deltas must not wipe it.

export function keepThoughtSignature(target, source) {
  if (!target || !source) return target;
  const extra = source.extra_content;
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return target;
  const prev = record(target.extra_content);
  const prevGoogle = record(prev.google);
  const nextGoogle = record(extra.google);
  const google = { ...prevGoogle, ...nextGoogle };
  if (typeof prevGoogle.thought_signature === 'string' && prevGoogle.thought_signature
    && (typeof nextGoogle.thought_signature !== 'string' || !nextGoogle.thought_signature)) {
    google.thought_signature = prevGoogle.thought_signature;
  }
  target.extra_content = {
    ...prev,
    ...extra,
    ...(Object.keys(google).length ? { google } : {}),
  };
  return target;
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
