import { logToApp } from '../../lib/appLog/browserLog.js';

// Which month, list or month view, the picked day and whether the composer
// is open are each person's own, remembered in this browser per Calendar
// window. They used to live in the board's shared window, so two people on
// one Calendar kept writing their view over each other's.

const KEY = 'homebase.calendar.view.v1';
const MAX_WINDOWS = 50;

function readAll(storage) {
  try {
    const all = JSON.parse(storage?.getItem(KEY) || '{}');
    return all && typeof all === 'object' ? all : {};
  } catch {
    return {};
  }
}

export function loadCalendarView(winId, storage = globalThis.localStorage) {
  const saved = readAll(storage)[winId];
  if (!saved || typeof saved !== 'object') return {};
  const date = saved.currentDate ? new Date(saved.currentDate) : null;
  return {
    currentDate: date && !Number.isNaN(date.getTime()) ? date : null,
    viewMode: saved.viewMode === 'list' ? 'list' : 'month',
    selectedDateStr: typeof saved.selectedDateStr === 'string' ? saved.selectedDateStr : null,
    isComposing: Boolean(saved.isComposing),
  };
}

export function saveCalendarView(winId, view, storage = globalThis.localStorage) {
  if (!winId) return;
  const all = readAll(storage);
  delete all[winId];
  all[winId] = view;
  const ids = Object.keys(all);
  for (const id of ids.slice(0, Math.max(0, ids.length - MAX_WINDOWS))) delete all[id];
  try { storage?.setItem(KEY, JSON.stringify(all)); } catch { /* private window: keep it for this visit */ }
}

export function logCalendarViewSetAside() {
  logToApp('info', 'calendar: set aside a view saved into the shared board window; each person keeps their own now', { where: 'calendar' });
}
