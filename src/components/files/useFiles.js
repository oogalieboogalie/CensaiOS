import React from 'react';

export function normalizeSearchResults(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
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

  const loadDir = () => {
    if (pathInput.trim()) {
      onUpdate({ dirPath: pathInput.trim() });
    }
  };

  const clearDir = () => {
    onUpdate({ dirPath: '', githubRepo: null });
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
