// Per-browser intent that must never ride the shared board.
// autoSend: only the browser that queued the chat may POST it.
// An agent run or a coding CLI starts only after this browser asked.

const autoSend = new Set();
const runs = new Map();
const clis = new Map();

export function noteLocalAutoSend(windowId, patch) {
  if (!patch || !Object.prototype.hasOwnProperty.call(patch, 'autoSend')) return;
  const id = String(windowId || '');
  if (!id) return;
  if (patch.autoSend) autoSend.add(id);
  else autoSend.delete(id);
}

/** True once, for the browser that just queued this chat. Then forgotten. */
export function takeLocalAutoSend(windowId) {
  const id = String(windowId || '');
  if (!autoSend.has(id)) return false;
  autoSend.delete(id);
  return true;
}

export function armAgentRun(windowId, { prompt, sessionId } = {}) {
  const text = String(prompt || '').trim();
  const id = String(windowId || '');
  if (!id || !text || !sessionId) return;
  runs.set(id, { prompt: text, sessionId: String(sessionId) });
}

/** The prompt this browser just asked to run, for this shell session only. */
export function armedAgentPrompt(windowId, sessionId) {
  const row = runs.get(String(windowId || ''));
  if (!row || row.sessionId !== String(sessionId || '')) return undefined;
  return row.prompt;
}

export function armLaunchCli(windowId, cli) {
  const id = String(windowId || '');
  if (!id || !cli) return;
  clis.set(id, String(cli));
}

/** The CLI this browser just opened, or nothing if the flag arrived from someone else. */
export function armedLaunchCli(windowId, requested) {
  if (!requested) return undefined;
  return clis.get(String(windowId || '')) === String(requested) ? String(requested) : undefined;
}

/** Record intent from a window this browser spawned or edited. */
export function noteLocalWindowIntent(windowId, patch) {
  noteLocalAutoSend(windowId, patch);
  if (patch && patch.launchCli) armLaunchCli(windowId, patch.launchCli);
}
