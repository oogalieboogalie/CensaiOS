import React from 'react';
import { api } from '../../lib/api.js';

export function normalizeSearchResults(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function folderKey(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

export function isInsideFolder(target, root) {
  const t = folderKey(target);
  const r = folderKey(root);
  return !!r && (t === r || t.startsWith(`${r}/`));
}

/** The folder above this one, written with the path's own slashes. */
export function parentFolder(dirPath) {
  const raw = String(dirPath || '');
  const sep = raw.includes('\\') || /^[a-z]:/i.test(raw) ? '\\' : '/';
  const parts = raw.replace(/[\\/]+$/, '').split(/[\\/]/);
  if (parts.length <= 1) return '';
  if (parts.length === 2 && parts[0] === '') return '/';
  if (parts.length === 2 && /^[a-z]:$/i.test(parts[0])) return `${parts[0]}\\`;
  return parts.slice(0, -1).join(sep);
}

export function useFiles({ win, onUpdate, currentProject }) {
  const mode = win.mode || 'local';
  const [tree, setTree] = React.useState(null);
  const [repos, setRepos] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [pathInput, setPathInput] = React.useState(win.dirPath || currentProject?.path || '');
  const [searchInput, setSearchInput] = React.useState('');
  const [searchResults, setSearchResults] = React.useState(null);
  const [searchLoading, setSearchLoading] = React.useState(false);

  const seededWindowRef = React.useRef(null);

  // The path bar follows the window's folder ("set root", Up, a project
  // switch) so it never shows a folder the tree has already left.
  React.useEffect(() => {
    if (win.dirPath) setPathInput(win.dirPath);
  }, [win.dirPath]);

  // Each file tree owns its root (win.dirPath). The global project only seeds
  // a window that never had a root — switching projects from the dropdown
  // must never rewrite trees the user already pointed elsewhere.
  React.useEffect(() => {
    if (mode !== 'local') return;
    if (win.dirPath || seededWindowRef.current === win.id) return;
    if (!currentProject?.path) return;
    seededWindowRef.current = win.id;
    onUpdate({ dirPath: currentProject.path });
    setPathInput(currentProject.path);
  }, [mode, win.dirPath, win.id, currentProject?.path, onUpdate]);

  React.useEffect(() => {
    if (mode === 'local') {
      if (win.dirPath) {
        setTree({ name: win.dirPath.split(/[\\/]/).pop() || win.dirPath, path: win.dirPath, isDir: true, open: true });
      } else {
        setTree(null);
      }
    } else if (mode === 'github') {
      if (win.githubRepo) {
        setTree({ name: win.githubRepo, path: '/', isDir: true, open: true });
      } else {
        setTree(null);
        setLoading(true);
        setError('');
        fetch(`/api/github/repos`)
          .then(res => { if (!res.ok) throw new Error(`Status ${res.status}`); return res.json(); })
          .then(data => { setRepos(data); setLoading(false); })
          .catch(err => { setError(err.message || 'Failed to fetch repos'); setLoading(false); });
      }
    }
  }, [mode, win.dirPath, win.githubRepo]);

  React.useEffect(() => {
    if (!searchInput.trim()) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(() => {
      setSearchLoading(true);
      if (mode === 'local') {
        fetch(`/api/files/search?path=${encodeURIComponent(win.dirPath || '')}&q=${encodeURIComponent(searchInput)}`)
          .then(res => res.json())
          .then(data => { setSearchResults(normalizeSearchResults(data)); setSearchLoading(false); })
          .catch(() => { setSearchResults([]); setSearchLoading(false); });
      } else if (mode === 'github' && win.githubRepo) {
        fetch(`/api/github/search?repo=${encodeURIComponent(win.githubRepo)}&q=${encodeURIComponent(searchInput)}`)
          .then(res => res.json())
          .then(data => { setSearchResults(normalizeSearchResults(data)); setSearchLoading(false); })
          .catch(() => { setSearchResults([]); setSearchLoading(false); });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput, mode, win.dirPath, win.githubRepo]);

  const loadDir = async (target) => {
    const next = (typeof target === 'string' ? target : pathInput).trim();
    if (!next) return;
    setPathInput(next);
    // Moving inside the folder this window already works in needs no new
    // project: the tree just re-roots there.
    const root = win.project?.path;
    if (root && isInsideFolder(next, root)) {
      onUpdate({ dirPath: next });
      return;
    }
    // Multi-project board: a typed folder joins the board's open projects
    // (without changing the default), so this tree can read it while other
    // trees stay where they are.
    let project = null;
    try {
      project = await api.openProject({ path: next });
    } catch {
      // Not openable as a project (or no local filesystem): the tree shows
      // the server's own answer for the path instead.
    }
    onUpdate({
      dirPath: next,
      project: { type: 'local', name: project?.name || next.split(/[\\/]/).filter(Boolean).pop() || next, path: project?.path || next, chosen: true },
    });
  };

  const clearDir = () => {
    onUpdate({ dirPath: '', githubRepo: null, project: null });
    setPathInput('');
    setSearchInput('');
    setTree(null);
    setRepos(null);
    setSearchResults(null);
  };

  return {
    mode,
    tree,
    repos,
    loading,
    error,
    pathInput,
    setPathInput,
    searchInput,
    setSearchInput,
    searchResults,
    searchLoading,
    loadDir,
    clearDir,
    onUpdate,
  };
}
