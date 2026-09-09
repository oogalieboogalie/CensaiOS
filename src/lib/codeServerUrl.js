// Code-server URL validation and normalization helpers.
// Used by CodeEditorWindow when win.codeServerUrl is set (iframe mount mode).

export function isValidCodeServerUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (!parsed.hostname || parsed.hostname.length === 0) return false;
    return true;
  } catch (_err) {
    return false;
  }
}

export function normalizeCodeServerUrl(url) {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (trimmed.length === 0) return '';
  // Strip trailing slashes — caller can add a path if needed.
  return trimmed.replace(/\/+$/, '');
}
