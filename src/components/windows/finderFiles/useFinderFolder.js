import React from 'react';
import { finderProblem } from './finderFormat.js';

/**
 * Lists one folder with the Finder's columns (when each entry changed, each
 * file's size), and `at`, the folder's path in the server's own words. A
 * refusal throws with the server's status, reason and words.
 */
export async function listFinderFolder(folder) {
  const res = await fetch(`/api/files/browse?path=${encodeURIComponent(folder)}&details=1`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(`Could not list this folder (${res.status})`), { status: res.status, reason: data.reason, error: data.error });
  }
  return { items: Array.isArray(data.children) ? data.children : [], at: typeof data.path === 'string' ? data.path : '' };
}

/**
 * The folder a Finder shows, starting at the project's top folder, with Back
 * and Forward. Each person browses on their own: where the Finder is, is not
 * saved to the shared board. Coming back to the window (isActive) lists the
 * folder again, so files changed meanwhile show. `shownRoot` is the top
 * folder in the server's words, which its folders' paths start with (in
 * Docker on Linux, /workspace/projects/garden for /home/pat/Projects/garden).
 */
export function useFinderFolder(root, isActive) {
  const [trail, setTrail] = React.useState({ stack: [root], at: 0 });
  const [view, setView] = React.useState({ folder: '', items: null, problem: null });
  const [top, setTop] = React.useState({ items: [], at: root });
  const asked = React.useRef(0);
  const folder = trail.stack[trail.at];

  const load = React.useCallback(async (target, { quiet = false } = {}) => {
    const mine = asked.current + 1;
    asked.current = mine;
    if (!quiet) setView({ folder: target, items: null, problem: null });
    try {
      const { items, at } = await listFinderFolder(target);
      if (mine !== asked.current) return;
      setView({ folder: target, items, problem: null });
      if (target === root) setTop({ items, at: at || root });
    } catch (err) {
      if (mine !== asked.current) return;
      setView({ folder: target, items: [], problem: finderProblem(err) });
      // A top folder that is gone has no folders to offer.
      if (target === root) setTop({ items: [], at: root });
    }
  }, [root]);

  React.useEffect(() => { load(folder); }, [folder, load]);

  const wasActive = React.useRef(isActive);
  React.useEffect(() => {
    if (isActive && !wasActive.current) load(folder, { quiet: true });
    wasActive.current = isActive;
  }, [isActive, folder, load]);

  const go = React.useCallback((next) => {
    setTrail((t) => (t.stack[t.at] === next ? t : { stack: [...t.stack.slice(0, t.at + 1), next], at: t.at + 1 }));
  }, []);
  const step = (by) => setTrail((t) => ({ ...t, at: Math.min(Math.max(t.at + by, 0), t.stack.length - 1) }));

  const shown = view.folder === folder;
  return {
    folder,
    items: shown ? view.items : null,
    problem: shown ? view.problem : null,
    topFolders: top.items.filter((item) => item.isDir),
    shownRoot: top.at,
    go,
    back: () => step(-1),
    forward: () => step(1),
    canBack: trail.at > 0,
    canForward: trail.at < trail.stack.length - 1,
  };
}
