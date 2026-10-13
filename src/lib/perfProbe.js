/**
 * Client-side lag diagnostics probe (singleton).
 *
 * Records main-thread blockages (longtask entries), workspace save timings,
 * and connection flaps. `diagnose()` turns the raw samples into plain-language
 * verdicts so a lag spike explains itself instead of just hurting.
 *
 * No dependencies, no rendering — the Diagnostics window polls this.
 */

const LONGTASK_KEEP = 30;
const SAVE_KEEP = 20;
const FLAP_KEEP = 20;
const LONGTASK_BUDGET_MS = 50;

const state = {
  longtasks: [],
  saves: [],
  flaps: [],
  startedAt: Date.now(),
};

function pushCapped(list, entry, keep) {
  list.push(entry);
  while (list.length > keep) list.shift();
}

export function __resetPerfProbeForTests() {
  state.longtasks = [];
  state.saves = [];
  state.flaps = [];
  state.startedAt = Date.now();
}

export function __pushLongtaskForTests(durationMs, at = Date.now()) {
  pushCapped(state.longtasks, { at, durationMs: Math.round(durationMs) }, LONGTASK_KEEP);
}

export function __pushFlapForTests(from, to, at = Date.now()) {
  pushCapped(state.flaps, { at, from, to }, FLAP_KEEP);
}

export function observeLongtasks() {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return () => {};
  try {
    const observer = new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        pushCapped(state.longtasks, {
          at: Date.now(),
          durationMs: Math.round(entry.duration),
        }, LONGTASK_KEEP);
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
    return () => observer.disconnect();
  } catch {
    return () => {};
  }
}

export function recordSaveSample({ serializeMs, persistMs, ok = true, wins = null, bytes = null }) {
  pushCapped(state.saves, {
    at: Date.now(),
    serializeMs: Math.round(serializeMs),
    persistMs: Math.round(persistMs),
    totalMs: Math.round(serializeMs + persistMs),
    ok,
    wins,
    bytes,
  }, SAVE_KEEP);
}

export function recordConnectionFlap(from, to) {
  pushCapped(state.flaps, { at: Date.now(), from, to }, FLAP_KEEP);
}

export function snapshotStats() {
  const now = Date.now();
  const windowMs = 60_000;
  const recentTasks = state.longtasks.filter((t) => now - t.at < windowMs);
  const recentFlaps = state.flaps.filter((f) => now - f.at < windowMs);
  const lastSave = state.saves.length > 0 ? state.saves[state.saves.length - 1] : null;
  const slowSaves = state.saves.filter((s) => s.totalMs > 500);
  return {
    uptimeSec: Math.round((now - state.startedAt) / 1000),
    longtasksLast60s: recentTasks.length,
    worstLongtaskMs: recentTasks.reduce((m, t) => Math.max(m, t.durationMs), 0),
    flapsLast60s: recentFlaps.length,
    lastFlap: state.flaps.length > 0 ? state.flaps[state.flaps.length - 1] : null,
    lastSave,
    slowSaveCount: slowSaves.length,
    saveCount: state.saves.length,
  };
}

/**
 * Plain-language verdicts, worst first. Each verdict: { level: 'bad'|'warn'|'ok', text }.
 * `wsStatus` is the collaboration status string ('live', 'reconnecting', ...).
 */
export function diagnose({ wsStatus = 'unknown', wins = null } = {}) {
  const stats = snapshotStats();
  const verdicts = [];

  if (wsStatus === 'reconnecting' || wsStatus === 'connecting') {
    verdicts.push({
      level: 'bad',
      text: `Connection is ${wsStatus}: window moves wait for the 1s autosave round-trip instead of streaming live. Check the server on :3001 and the Vite proxy.`,
    });
  }
  if (stats.flapsLast60s >= 3) {
    verdicts.push({
      level: 'bad',
      text: `${stats.flapsLast60s} connection flaps in the last minute — the socket keeps dropping. Usual suspects: dev server restarting (--watch on file saves), two servers fighting over :3001, or the machine sleeping.`,
    });
  }
  if (stats.longtasksLast60s >= 5) {
    verdicts.push({
      level: 'bad',
      text: `${stats.longtasksLast60s} main-thread blocks over ${LONGTASK_BUDGET_MS}ms in the last minute (worst ${stats.worstLongtaskMs}ms). The tab is choking on render work — many windows, a huge Files tree, or something else hot on this machine (Ollama, Docker build).`,
    });
  } else if (stats.longtasksLast60s > 0) {
    verdicts.push({
      level: 'warn',
      text: `${stats.longtasksLast60s} minor main-thread block(s) in the last minute (worst ${stats.worstLongtaskMs}ms). Not enough to explain real lag alone.`,
    });
  }
  if (stats.lastSave && stats.lastSave.totalMs > 1000) {
    verdicts.push({
      level: 'bad',
      text: `Last autosave took ${stats.lastSave.totalMs}ms (serialize ${stats.lastSave.serializeMs}ms + persist ${stats.lastSave.persistMs}ms). Saves block the next edit cycle — large canvas or a slow DB round-trip.`,
    });
  } else if (stats.lastSave && stats.lastSave.totalMs > 500) {
    verdicts.push({
      level: 'warn',
      text: `Last autosave took ${stats.lastSave.totalMs}ms — sluggish but under the pain threshold.`,
    });
  }
  if (stats.lastSave && stats.lastSave.ok === false) {
    verdicts.push({
      level: 'bad',
      text: 'The last autosave FAILED. Edits are piling up locally and every interaction waits on retry. Look for the save guard / recovery banner.',
    });
  }
  if (typeof wins === 'number' && wins > 60) {
    verdicts.push({
      level: 'warn',
      text: `${wins} windows on this canvas — every drag re-renders all of them. Closing or grouping idle windows is the cheapest speedup available.`,
    });
  }
  if (verdicts.length === 0) {
    verdicts.push({
      level: 'ok',
      text: 'Nothing red in the last minute: connection steady, main thread clear, saves fast. If it still feels laggy, it is likely outside this tab (host CPU/RAM — see Host Status) or below ~100ms perception noise.',
    });
  }
  return { stats, verdicts };
}

export const PERF_PROBE_LIMITS = Object.freeze({
  longtaskBudgetMs: LONGTASK_BUDGET_MS,
});
