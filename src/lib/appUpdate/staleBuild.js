/**
 * A window left open across an update still runs the old build; the first
 * window it lazy-loads asks for a file the new build no longer has and fails.
 * Reload once into the new build instead of leaving a broken board.
 */
const KEY = 'censai.staleBuildReloadAt';
const QUIET_MS = 60_000;

export function installStaleBuildReload({ win = window, storage = win.sessionStorage, now = () => Date.now() } = {}) {
  win.addEventListener('vite:preloadError', (event) => {
    let last = 0;
    try { last = Number(storage.getItem(KEY)) || 0; } catch { /* storage off: still reload once */ }
    // Reloaded a moment ago and it still fails: a real error, let it show.
    if (now() - last < QUIET_MS) return;
    try { storage.setItem(KEY, String(now())); } catch { /* ignore */ }
    event.preventDefault();
    win.location.reload();
  });
}
