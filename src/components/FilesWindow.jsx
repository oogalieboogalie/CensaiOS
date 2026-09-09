import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { useWorkspaceStore } from '../lib/store.js';
import { 
  useFiles, Tree, 
  FileModeSelector, LocalPathBar, GithubRepoBar, FileSearchFilter,
  LocalEmptyState, GithubRepoList 
} from './files/index.js';
import { FileCreateRow } from './files/FileCreateRow.jsx';
import { fileWindowKind, fileWindowProps } from './files/fileRouting.js';

export function FilesWindow({ win, pan, zoom, onUpdate, onSpawn, currentProject, wins, onSelect }) {
  const {
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
  } = useFiles({ win, onUpdate, currentProject });

  const [creating, setCreating] = React.useState(null);
  const [refreshTick, setRefreshTick] = React.useState(0);
  const [switchError, setSwitchError] = React.useState('');
  const canCreate = mode === 'local' && win.dirPath;
  const openLocalProject = useWorkspaceStore(s => s.openLocalProject);

  const handleCreated = (made) => {
    setCreating(null);
    if (made) setRefreshTick(t => t + 1);
  };

  const handleOpenFile = (fileName, fullPath) => {
    onSpawn?.(fileWindowKind(fileName), {
      ...fileWindowProps({ name: fileName, path: fullPath }, null),
      isEditing: true,
    });
  };

  return (
    <>
      <WindowTitle 
        accent="var(--ps-yellow)" 
        icon={<Icon.Folder size={14}/>} 
        label="Project files" 
        subtitle={mode === 'local' ? (win.dirPath || "Local Explorer") : (win.githubRepo || "GitHub Explorer")} 
        attachedAgentIds={win.attachedAgents} 
        onDetach={(id) => onUpdate?.({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })} 
      />

      <FileModeSelector mode={mode} onUpdate={onUpdate} />

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '8px 6px', fontFamily: 'var(--font-mono)', fontSize: 12, display: 'flex', flexDirection: 'column' }}>
        
        {mode === 'local' && win.dirPath && (
          <LocalPathBar pathInput={pathInput} setPathInput={setPathInput} loadDir={loadDir} clearDir={clearDir} />
        )}

        {mode === 'local' && win.dirPath && (
          <div style={{ display: 'flex', gap: 6, padding: '0 10px 6px', alignItems: 'center' }}>
            <button
              onClick={() => {
                const clean = win.dirPath.replace(/[\\/]+$/, '');
                const parent = clean.split(/[\\/]/).slice(0, -1).join('\\');
                if (parent) setPathInput(parent);
              }}
              title="Go up one folder (fills the path bar; open as project if outside the current root)"
              style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: 'var(--ink-soft)', padding: '3px 8px', borderRadius: 6, background: 'var(--surface-2)' }}
            >
              ↑ Up
            </button>
            <button
              onClick={async () => {
                setSwitchError('');
                try {
                  await openLocalProject?.({ path: pathInput.trim() });
                } catch (err) {
                  setSwitchError(err?.message || 'Could not open project');
                }
              }}
              title="Work out of the path above as a project (registers it and re-roots here)"
              style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: 'var(--accent-ink)', padding: '3px 8px', borderRadius: 6, background: 'var(--accent-soft)', fontWeight: 600 }}
            >
              Open as project
            </button>
          </div>
        )}
        {switchError && <div style={{ padding: '0 10px 6px', color: 'var(--ps-red)', fontSize: 11 }}>Error: {switchError}</div>}

        {mode === 'github' && win.githubRepo && (
          <GithubRepoBar githubRepo={win.githubRepo} clearDir={clearDir} />
        )}

        {(win.dirPath || win.githubRepo) && (
          <FileSearchFilter searchInput={searchInput} setSearchInput={setSearchInput} />
        )}

        {canCreate && !creating && (
          <div style={{ display: 'flex', gap: 6, padding: '0 10px 6px' }}>
            <button onClick={() => setCreating('file')} title="New file in this folder" style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: 'var(--ink-soft)', padding: '3px 8px', borderRadius: 6, background: 'var(--surface-2)' }}>+ File</button>
            <button onClick={() => setCreating('folder')} title="New subfolder here" style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: 'var(--ink-soft)', padding: '3px 8px', borderRadius: 6, background: 'var(--surface-2)' }}>+ Folder</button>
          </div>
        )}

        {canCreate && creating && (
          <FileCreateRow mode={creating} dirPath={win.dirPath} onDone={handleCreated} onOpenFile={handleOpenFile} />
        )}

        {loading && <div style={{ padding: 12, color: 'var(--ink-faint)' }}>Loading...</div>}
        {error && <div style={{ padding: 12, color: 'var(--ps-red)', fontFamily: 'var(--font-sans)', fontSize: 12 }}>Error: {error}</div>}

        {mode === 'local' && !win.dirPath && (
          <LocalEmptyState pathInput={pathInput} setPathInput={setPathInput} loadDir={loadDir} />
        )}

        {mode === 'github' && !win.githubRepo && repos && (
          <GithubRepoList repos={repos} onSelect={(repoName) => onUpdate({ githubRepo: repoName })} />
        )}

        {searchResults ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {searchLoading && <div style={{ padding: 12, color: 'var(--ink-faint)', fontStyle: 'italic' }}>Searching...</div>}
            {!searchLoading && searchResults.length === 0 && <div style={{ padding: 12, color: 'var(--ink-faint)' }}>No matches.</div>}
            {!searchLoading && searchResults.map(node => (
               <Tree key={`${node.path}-${refreshTick}`} node={node} depth={0} pan={pan} zoom={zoom} onSpawn={onSpawn} githubRepo={mode === 'github' ? win.githubRepo : null} mode={mode} rootDirPath={win.dirPath} wins={wins} onSelect={onSelect} onSetRoot={(p) => onUpdate({ dirPath: p })} />
            ))}
          </div>
        ) : (
          tree && <Tree key={`root-${win.dirPath}-${refreshTick}`} node={tree} depth={0} pan={pan} zoom={zoom} onSpawn={onSpawn} githubRepo={mode === 'github' ? win.githubRepo : null} mode={mode} rootDirPath={win.dirPath} wins={wins} onSelect={onSelect} onSetRoot={(p) => onUpdate({ dirPath: p })} />
        )}

        {(tree || searchResults) && (
          <div style={{ marginTop: 14, paddingLeft: 10, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1.5 }}>
            click opens code, docs & images · drag to canvas<br/>
            {mode === 'github' && 'drop image on folder to save to GitHub'}
          </div>
        )}
      </div>
    </>
  );
}
