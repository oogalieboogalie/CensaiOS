/**
 * Sender registry for live presence. Editors (doc/code windows) report
 * keystrokes and text here; AppContent wires the real collaboration senders
 * in. Module singleton avoids threading props through frame → renderer →
 * editor layers. Unset senders are safe no-ops (offline, tests).
 */

let senders = {
  sendCursor: null,
  sendTyping: null,
  sendTextPreview: null,
  sendInk: null,
  sendGame: null,
  sendDock: null,
  sendAgent: null,
};

export function setLivePresenceSenders(next) {
  senders = { ...senders, ...next };
}

export function resetLivePresenceSenders() {
  senders = { sendCursor: null, sendTyping: null, sendTextPreview: null, sendInk: null, sendGame: null, sendDock: null, sendAgent: null };
}

export function reportCursor(x, y) {
  try { senders.sendCursor?.(x, y); } catch { /* ephemeral — never throw */ }
}

export function reportTyping(windowId) {
  if (!windowId) return;
  try { senders.sendTyping?.(windowId); } catch { /* ephemeral — never throw */ }
}

export function reportTextPreview(windowId, text) {
  if (!windowId || typeof text !== 'string') return;
  try { senders.sendTextPreview?.(windowId, text); } catch { /* ephemeral — never throw */ }
}

/** A pen stroke in progress, so others watch it being drawn (spec 9). */
export function reportInk(payload) {
  if (!payload?.strokeId) return;
  try { senders.sendInk?.({ type: 'ink.preview', ...payload }); } catch { /* ephemeral — never throw */ }
}

/** A game's keys or picture of the match (spec 11). True when it went out. */
export function sendGameMessage(payload) {
  if (!payload?.type?.startsWith('game.')) return false;
  try { return Boolean(senders.sendGame?.(payload)); } catch { return false; }
}

/** A picture of a docked app for teammates (dock app windows). */
export function sendDockCast(payload) {
  if (payload?.type !== 'dock.cast') return false;
  try { return Boolean(senders.sendDock?.(payload)); } catch { return false; }
}

/** A chat's agent saved with another model, so teammates' open copies show it at once. True when it went out. */
export function reportAgentChange(agentId) {
  if (!agentId) return false;
  try { return Boolean(senders.sendAgent?.({ type: 'agent.changed', agentId: String(agentId) })); } catch { return false; }
}
