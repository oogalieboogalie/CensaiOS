/**
 * A person is using this censaiOS when they typed or clicked in the last
 * 10 minutes. The board reports that (POST /api/app-update/activity).
 * Background polls do not: an open window on its own is not someone here.
 * Only the automatic install waits on this. Restart now is their choice.
 */

export const INPUT_QUIET_MS = 10 * 60 * 1000;

let lastInputAt = 0;

export function noteAppInput(now = Date.now()) {
  lastInputAt = now;
}

export function recentAppInput(now = Date.now(), withinMs = INPUT_QUIET_MS) {
  return lastInputAt > 0 && now - lastInputAt < withinMs;
}

export function resetAppInput() {
  lastInputAt = 0;
}
