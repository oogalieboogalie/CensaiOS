// On a guest board, windows render from the shared board picture, but many
// window kinds also call account-only APIs when they mount (todo sync,
// provider lists, file trees). The server refuses those for guests anyway;
// letting them fail paints "Unauthorized" across a client's view. Instead
// they are held back in the browser and simply never answer, so a window
// shows its content and stays quiet. Guest endpoints pass straight through.
const ALLOWED_PREFIXES = ['/api/guest/', '/api/auth/session', '/api/health'];

export function isGuestAllowedRequest(input, origin = globalThis.location?.origin) {
  let path;
  try {
    const raw = typeof input === 'string' ? input : input?.url;
    path = new URL(raw, origin).pathname;
  } catch {
    return true;
  }
  if (!path.startsWith('/api/')) return true;
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

let installed = false;

export function installGuestFetchGuard(target = globalThis) {
  if (installed || typeof target.fetch !== 'function') return;
  installed = true;
  const originalFetch = target.fetch.bind(target);
  target.fetch = (input, init) => {
    if (isGuestAllowedRequest(input)) return originalFetch(input, init);
    return new Promise(() => {});
  };
}
