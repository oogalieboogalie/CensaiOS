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
};

export function setLivePresenceSenders(next) {
  senders = { ...senders, ...next };
}

export function resetLivePresenceSenders() {
  senders = { sendCursor: null, sendTyping: null, sendTextPreview: null };
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

/**
 * Diff two presence snapshots into join/leave notices. Pure — tested.
 * The first snapshot only establishes the baseline (no toasts for people
 * already here when you arrive); the hook guards reconnects the same way.
 */
export function diffPresenceNotices(previous, next) {
  const before = new Map((previous || []).map((p) => [p.clientId, p]));
  const after = new Map((next || []).map((p) => [p.clientId, p]));
  const notices = [];
  for (const [id, p] of after) {
    if (!before.has(id)) {
      notices.push({
        id: `join-${id}-${Date.now()}`,
        kind: 'join',
        text: `${p.actor?.label || 'Someone'} joined the canvas`,
      });
    }
  }
  for (const [id, p] of before) {
    if (!after.has(id)) {
      notices.push({
        id: `leave-${id}-${Date.now()}`,
        kind: 'leave',
        text: `${p.actor?.label || 'Someone'} left`,
      });
    }
  }
  return notices;
}
