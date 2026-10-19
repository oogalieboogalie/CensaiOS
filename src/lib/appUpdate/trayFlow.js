/**
 * What the tray's "Update censaiOS" panel says (src/components/TrayUpdatePanel.jsx).
 * Plain functions so the wording is tested without a browser.
 */

/** The window event the desktop tray sends (src-tauri/src/tray.rs). */
export const TRAY_UPDATE_EVENT = 'censaios:update-now';
export const WAIT_KEY = 'censaios.update.waitFor';

const plural = (n, one, many) => (n === 1 ? one : many);

/** "2 changes are still being finished" style lines for open changes and busy agents. */
export function describeWork(inFlight) {
  const changes = Array.isArray(inFlight?.changes) ? inFlight.changes : [];
  const agents = Array.isArray(inFlight?.agents) ? inFlight.agents : [];
  const changeLine = changes.length
    ? `${changes.length} ${plural(changes.length, 'change is', 'changes are')} still being finished by the crew.`
    : '';
  const names = [...new Set(agents.map((a) => a.name))];
  const agentLine = names.length
    ? `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''} ${plural(names.length, 'is', 'are')} in the middle of a task. The update waits for ${plural(names.length, 'it', 'them')} to finish first.`
    : '';
  return { changes, agents, changeLine, agentLine };
}

/** True once the updater has looked since `askedAt` (an ISO time). */
export function lookedSince(status, askedAt) {
  if (!askedAt) return true;
  const at = Date.parse(status?.checked?.at || '');
  return Number.isFinite(at) && at >= Date.parse(askedAt) && !status?.checking;
}

/**
 * Which screen the panel shows:
 * checking | docker-off | build-failed | up-to-date | ready
 */
export function panelStage(status, askedAt) {
  if (!lookedSince(status, askedAt)) return 'checking';
  if (status?.ready) return 'ready';
  const result = status?.checked?.result;
  if (result === 'docker-off' || result === 'build-failed') return result;
  return 'up-to-date';
}

export const STAGE_TEXT = {
  checking: 'Looking for a newer censaiOS…',
  'docker-off': 'Docker is not running, so the update cannot be built. Start Docker Desktop, then try Update again.',
  'build-failed': 'The newest censaiOS did not build, so you stay on this one. The crew can see why in the update log.',
  'up-to-date': 'censaiOS is up to date.',
};

/** Open-change numbers from a saved "wait for them" choice still open now. */
export function stillOpen(waitFor, inFlight) {
  const open = new Set((inFlight?.changes || []).map((c) => c.number));
  return (waitFor?.numbers || []).filter((n) => open.has(n));
}

export function readWait(storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage?.getItem(WAIT_KEY) || 'null');
    return Array.isArray(raw?.numbers) ? raw : null;
  } catch {
    return null;
  }
}

export function saveWait(value, storage = globalThis.localStorage) {
  try {
    if (value) storage?.setItem(WAIT_KEY, JSON.stringify(value));
    else storage?.removeItem(WAIT_KEY);
  } catch { /* private window: the wait lasts while this page is open */ }
}
