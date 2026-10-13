export function prepareCohereToolPayload(payload) {
  if (!Array.isArray(payload?.tools) || payload.tools.length === 0) return payload;
  return { ...payload, strict_tools: true };
}