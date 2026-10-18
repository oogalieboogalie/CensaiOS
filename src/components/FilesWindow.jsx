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
import { parentFolder } from './files/useFiles.js';
import { ProjectVersions } from './files/ProjectVersions.jsx';

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
    searchError,
    loadDir,
    clearDir,
  } = useFiles({ win, onUpdate, currentProject });

  const [creating, setCreating] = React.useState(null);
  const [refreshTick, setRefreshTick] = React.useState(0);
  const [switchError, setSwitchError] = React.useState('');
  const canCreate = mode === 'local' && win.dirPath;
  const openLocalProject = useWorkspaceStore(s => s.openLocalProject);

  const [liveTick, setLiveTick] = React.useState(0);
  const refreshTree = React.useCallback(() => setLiveTick(t => t + 1), []);

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

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '8px 6px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', display: 'flex', flexDirection: 'column' }}>
        
        {mode === 'local' && win.dirPath && (
          <LocalPathBar pathInput={pathInput} setPathInput={setPathInput} loadDir={loadDir} clearDir={clearDir} />
        )}

        {mode === 'local' && win.dirPath && (
          <div style={{ display: 'flex', gap: 6, padding: '0 10px 6px', alignItems: 'center' }}>
            <button
              onClick={() => {
                const parent = parentFolder(win.dirPath);
                if (parent) loadDir(parent);
              }}
              title="Go up one folder"
              style={{ all: 'unset', cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', padding: '3px 8px', borderRadius: 'var(--radius-md)', background: 'var(--surface-2)' }}
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
              style={{ all: 'unset', cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--accent-ink)', padding: '3px 8px', borderRadius: 'var(--radius-md)', background: 'var(--accent-soft)', fontWeight: 600 }}
            >
              Open as project
            </button>
            <button
              onClick={() => onSpawn?.('devServer', { folder: win.dirPath, autoStart: true })}
              title="Run this project's dev server in a throwaway Docker container and show the site on the canvas"
              style={{ all: 'unset', cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--ink)', padding: '3px 8px', borderRadius: 'var(--radius-md)', background: 'var(--surface-2)', border: '1px solid var(--hairline)', fontWeight: 600, marginLeft: 'auto' }}
            >
              ▶ Run dev
            </button>
          </div>
        )}
        {switchError && <div style={{ padding: '0 10px 6px', color: 'var(--ps-red)', fontSize: 'var(--text-xs)' }}>Error: {switchError}</div>}

        {mode === 'github' && win.githubRepo && (
          <GithubRepoBar githubRepo={win.githubRepo} clearDir={clearDir} />
        )}

        {(win.dirPath || win.githubRepo) && (
          <FileSearchFilter searchInput={searchInput} setSearchInput={setSearchInput} />
        )}

        {canCreate && !creating && (
          <div style={{ display: 'flex', gap: 6, padding: '0 10px 6px' }}>
            <button onClick={() => setCreating('file')} title="New file in this folder" style={{ all: 'unset', cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', padding: '3px 8px', borderRadius: 'var(--radius-md)', background: 'var(--surface-2)' }}>+ File</button>
            <button onClick={() => setCreating('folder')} title="New subfolder here" style={{ all: 'unset', cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', padding: '3px 8px', borderRadius: 'var(--radius-md)', background: 'var(--surface-2)' }}>+ Folder</button>
          </div>
        )}

        {canCreate && creating && (
          <FileCreateRow mode={creating} dirPath={win.dirPath} onDone={handleCreated} onOpenFile={handleOpenFile} />
        )}

        {loading && <div style={{ padding: 12, color: 'var(--ink-faint)' }}>Loading...</div>}
        {error && <div style={{ padding: 12, color: 'var(--ps-red)', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)' }}>Error: {error}</div>}

        {mode === 'local' && !win.dirPath && (
          <LocalEmptyState pathInput={pathInput} setPathInput={setPathInput} loadDir={loadDir} />
        )}

        {mode === 'github' && !win.githubRepo && repos && (
          <GithubRepoList repos={repos} onSelect={(repoName) => onUpdate({ githubRepo: repoName })} />
        )}

        {searchResults ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {searchLoading && <div style={{ padding: 12, color: 'var(--ink-faint)', fontStyle: 'italic' }}>Searching...</div>}
            {!searchLoading && searchResults.length === 0 && <div style={{ padding: 12, color: searchError ? 'var(--ps-red)' : 'var(--ink-faint)' }}>{searchError || 'No matches.'}</div>}
            {!searchLoading && searchResults.map(node => (
               <Tree key={`${node.path}-${refreshTick}`} node={node} depth={0} pan={pan} zoom={zoom} onSpawn={onSpawn} githubRepo={mode === 'github' ? win.githubRepo : null} mode={mode} rootDirPath={win.dirPath} wins={wins} onSelect={onSelect} onSetRoot={(p) => onUpdate({ dirPath: p })} reloadTick={liveTick} />
            ))}
          </div>
        ) : (
          tree && <Tree key={`root-${mode}-${tree.name}-${tree.path}-${refreshTick}`} node={tree} depth={0} pan={pan} zoom={zoom} onSpawn={onSpawn} githubRepo={mode === 'github' ? win.githubRepo : null} mode={mode} rootDirPath={win.dirPath} wins={wins} onSelect={onSelect} onSetRoot={(p) => onUpdate({ dirPath: p })} reloadTick={liveTick} />
        )}

        {(tree || searchResults) && (
          <div style={{ marginTop: 14, paddingLeft: 10, fontFamily: 'var(--font-label)', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', letterSpacing: 'var(--label-tracking)', textTransform: 'var(--label-case)', lineHeight: 1.5 }}>
            click opens code, docs & images · drag to canvas<br/>
            {mode === 'github' && 'drop image on folder to save to GitHub'}
          </div>
        )}
      </div>
      {mode === 'local' && win.dirPath && <ProjectVersions dirPath={win.dirPath} onChanged={refreshTree} onSpawn={onSpawn} />}
    </>
  );
}
