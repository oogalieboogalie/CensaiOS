// Ask an unknown link what it is by reading its answer, without taking the
// whole stream. A file sends a length. A radio stream (audio, no length)
// does not. This runs in the browser; the audio element is what actually plays.

const AUDIO = /^audio\//i;

function hasLength(header) {
  if (header == null || String(header).trim() === '') return false;
  const n = Number(header);
  return Number.isFinite(n) && n >= 0;
}

/**
 * 'radio' when the answer is audio with no length, 'song' when audio has a
 * length, 'page' when the answer is something else, or null when the ask
 * itself failed (the audio element still gets to try).
 */
export async function tryLinkKind(url, doFetch = globalThis.fetch) {
  if (typeof doFetch !== 'function') return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  let res = null;
  try {
    res = await doFetch(url, { signal: ctrl.signal, redirect: 'follow', credentials: 'omit' });
    if (res.type === 'opaque') return null;
    const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    // A nameless or raw body is not proof either way; the audio element decides.
    if (!type || type === 'application/octet-stream') return null;
    if (!res.ok || !AUDIO.test(type)) return 'page';
    return hasLength(res.headers.get('content-length')) ? 'song' : 'radio';
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    try { await res?.body?.cancel?.(); } catch { /* already closed */ }
  }
}

/** What a playing element is, once it knows its length. NaN means not yet. */
export function kindFromDuration(duration, readyState) {
  if ((readyState || 0) < 1) return null;
  if (duration === Infinity) return 'radio';
  if (Number.isFinite(duration) && duration > 0) return 'song';
  return null;
}
