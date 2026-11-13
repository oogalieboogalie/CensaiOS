// The Finder's words: its columns (sizes, dates), the folders above the one
// it shows, and what it says when there is nothing to list. Pure, so the
// test team checks the window against the folder on disk with the same rules.

export const FINDER_WORDS = Object.freeze({
  noProject: 'No project is open on this board.',
  noProjectHint: "The Finder lists the files of this window's project. Open one to see its files.",
  openProject: 'Open a project…',
  ownerOpens: "Only this computer's owner can open a project on this board.",
  loading: 'Loading…',
  empty: 'This folder is empty.',
});

// What went wrong, by the reason the server gives (server/routes/files/browser.js).
const PROBLEMS = Object.freeze({
  missing: 'This folder is not there any more. It may have been moved or deleted.',
  outside: 'This folder is not in a project open on this board.',
});
const UNREADABLE = 'This folder could not be opened just now.';

/**
 * The words for a folder that could not be listed: the Finder's own for a
 * missing folder or one outside the open projects, the server's plain words
 * for its other refusals and for a folder censaiOS in Docker cannot see
 * (they say how to share it), and never an error's own text.
 */
export function finderProblem({ status, reason, error } = {}) {
  if (Object.hasOwn(PROBLEMS, reason)) return { reason, words: PROBLEMS[reason] };
  if ((status === 403 || reason === 'unseen') && error) return { reason: reason || 'refused', words: error };
  return { reason: 'unreadable', words: UNREADABLE };
}

const UNITS = ['KB', 'MB', 'GB', 'TB'];

/** A file's size the way Finder writes it: 52 bytes, 4 KB, 1.5 MB. Folders (no size) show "--". */
export function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '--';
  if (bytes < 1000) return bytes === 1 ? '1 byte' : `${bytes} bytes`;
  let value = bytes / 1000;
  let unit = 0;
  // Whole kilobytes, then one decimal: 999,600 bytes is "1 MB", not "1000 KB".
  while (unit < UNITS.length - 1 && value >= (unit === 0 ? 999.5 : 999.95)) {
    value /= 1000;
    unit += 1;
  }
  const shown = unit === 0 ? Math.round(value) : Number(value.toFixed(1));
  return `${shown} ${UNITS[unit]}`;
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const timeOf = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** When a file last changed: "Today at 9:55 AM", "Yesterday at 2:05 PM", "Mar 14, 2026 at 10:03 AM". */
export function formatModified(ms, now = new Date()) {
  if (!Number.isFinite(ms)) return '--';
  const when = new Date(ms);
  // Rounded: a day with a clock change is 23 or 25 hours long.
  const daysAgo = Math.round((startOfDay(now) - startOfDay(when)) / 86_400_000);
  if (daysAgo === 0) return `Today at ${timeOf(when)}`;
  if (daysAgo === 1) return `Yesterday at ${timeOf(when)}`;
  return `${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at ${timeOf(when)}`;
}

const slashed = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '');

/** A folder's own name: the last part of its path. */
export function folderNameOf(p) {
  return slashed(p).split('/').filter(Boolean).pop() || String(p || '');
}

/**
 * The folders from the project's top folder down to `folder`, as
 * [{ name, path }], written with the project path's own slashes (or those of
 * `shownRoot`, the top folder in the server's words, when the folders' paths
 * come in those). The top one carries the project's name.
 */
export function finderCrumbs(root, folder, rootName, shownRoot = root) {
  const top = { name: rootName || folderNameOf(root), path: root };
  const here = slashed(folder);
  const from = [root, shownRoot].find((p) => p && here.toLowerCase().startsWith(`${slashed(p).toLowerCase()}/`));
  if (!from) return [top];
  const sep = /\\|^[a-z]:/i.test(from) ? '\\' : '/';
  const crumbs = [top];
  let at = String(from).replace(/[\\/]+$/, '');
  for (const name of here.slice(slashed(from).length + 1).split('/').filter(Boolean)) {
    at = `${at}${sep}${name}`;
    crumbs.push({ name, path: at });
  }
  return crumbs;
}
