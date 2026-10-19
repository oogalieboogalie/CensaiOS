// Censai the orchestrator: where each job's checklist stands. An item is
// checked off ('ticked') only after Censai checked it itself (check.js);
// 'failed' means it was checked and is not true yet, 'unknown' that it could
// not be checked, with the reason. A job that ends leaves no item open, so a
// check that never ran is always said, never skipped in silence.

import { TESTS_ITEM, clip } from './shape.js';

export const checklistOf = (job) => (Array.isArray(job?.checklist) ? job.checklist : []);

export function allTicked(job) {
  const items = checklistOf(job);
  return items.length > 0 && items.every((item) => item.state === 'ticked');
}

export function tickCount(job) {
  const items = checklistOf(job);
  return { ticked: items.filter((item) => item.state === 'ticked').length, total: items.length };
}

/** "2 of 3 checked off", for step lines and Censai's tool results. */
export function tickWords(job) {
  const { ticked, total } = tickCount(job);
  if (total === 1) return ticked ? 'Checked off' : 'Not checked off yet';
  return ticked === total ? `All ${total} checked off` : `${ticked} of ${total} checked off`;
}

/** Set one item's state, with the plain line that says how it was checked or why not. */
export function setItem(item, state, line = '', detail = '') {
  item.state = state;
  item.line = clip(line, 300);
  if (detail) item.detail = clip(detail, 1500);
  else delete item.detail;
  return item;
}

/** A fresh round of checks: every item is open again. */
export function reopenChecklist(job) {
  for (const item of checklistOf(job)) setItem(item, 'open');
}

/** The job ends here: each item still open says why it was not checked. */
export function closeChecklist(job, why) {
  for (const item of checklistOf(job)) {
    if (item.state === 'open' || item.state === 'checking') setItem(item, 'unknown', `Not checked: ${why}.`);
  }
}

/** Work that turned out to change files gets the project's tests on its list. */
export function addTestsItem(job) {
  const items = checklistOf(job);
  if (items.some((item) => item.how === 'tests')) return false;
  items.push({ n: items.length + 1, text: TESTS_ITEM, how: 'tests', auto: true, state: 'open', line: '' });
  return true;
}

/**
 * ok true: every item is checked off. ok null: an item could not be checked
 * (sending the work back cannot fix that). ok false: the items that were
 * checked and are not true yet.
 */
export function checklistVerdict(job) {
  const items = checklistOf(job);
  if (allTicked(job)) return { ok: true, items: [] };
  const cannot = items.find((item) => item.state !== 'ticked' && item.state !== 'failed');
  if (cannot || !items.length) return { ok: null, item: cannot || null, items: [] };
  return { ok: false, items: items.filter((item) => item.state === 'failed') };
}
