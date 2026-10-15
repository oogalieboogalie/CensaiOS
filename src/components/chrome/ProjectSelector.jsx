import React from 'react';
import { api } from '../../lib/api.js';

export function ProjectSelector({ currentProject, onOpenLocalProject, onClose }) {
  const [openingProject, setOpeningProject] = React.useState(false);
  const [projectPath, setProjectPath] = React.useState(currentProject?.path || '');
  const [projectNameInput, setProjectNameInput] = React.useState(currentProject?.name || '');
  const [projectError, setProjectError] = React.useState('');
  const [projectsList, setProjectsList] = React.useState([]);
  const [newName, setNewName] = React.useState(null); // null = form closed
  const [making, setMaking] = React.useState(false);
  const projectInputRef = React.useRef(null);

  React.useEffect(() => {
    api.getProjects().then(list => {
      // Local-project dropdown: one entry per local folder. GitHub-only
      // rows have no path and cannot be worked out of — exclude them.
      // Agent-owned duplicates of the same folder collapse to the newest.
      const byPath = new Map();
      for (const p of list || []) {
        if (!p?.path) continue;
        const key = String(p.path).replace(/[\\/]+$/, '').toLowerCase();
        if (!byPath.has(key)) byPath.set(key, p);
      }
      setProjectsList([...byPath.values()]);
    }).catch(err => {
      console.error('Failed to load projects:', err);
    });
  }, []);

  React.useEffect(() => {
    if (!openingProject) return undefined;
    const timer = setTimeout(() => projectInputRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, [openingProject]);

  // Multi-project board: this only picks the default for NEW windows. Open
  // windows keep their own project, so there is nothing to confirm.
  const switchToProject = async ({ path, name }) => {
    setProjectError('');
    try {
      await onOpenLocalProject?.({ path, name });
      return true;
    } catch (err) {
      setProjectError(err.message || 'Failed to open project');
      return false;
    }
  };

  const commitOpenProject = async () => {
    const path = projectPath.trim();
    if (!path) return;
    const ok = await switchToProject({ path, name: projectNameInput.trim() || undefined });
    if (ok) {
      setOpeningProject(false);
      onClose();
    }
  };

  // A brand new empty project: its own folder in the projects folder, with
  // version saving on, made the default and opened in a file tree.
  const makeNewProject = async () => {
    const name = String(newName || '').trim();
    if (!name || making) return;
    setMaking(true);
    setProjectError('');
    try {
      const made = await api.createNewProject(name);
      if (await switchToProject({ path: made.path, name: made.name })) {
        setNewName(null);
        onClose();
      }
    } catch (err) {
      setProjectError(err.message || 'Could not make the project');
    }
    setMaking(false);
  };

  return (
    <>
      <div style={{ padding: '6px 10px 4px', display: 'grid', gap: 6 }}>
        {newName === null ? (
          <button data-testid="new-project" onClick={() => setNewName('')} style={{ all: 'unset', cursor: 'pointer', padding: '7px 10px', borderRadius: 'var(--radius-md)', background: 'var(--accent)', color: 'var(--accent-contrast)', fontSize: 'var(--text-xs)', fontWeight: 700, textAlign: 'center' }}>
            New project
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <input autoFocus data-testid="new-project-name" value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') makeNewProject(); if (e.key === 'Escape') setNewName(null); }}
              placeholder="Name it, like Lead form"
              style={{ all: 'unset', flex: 1, minWidth: 0, border: '1px solid var(--hairline)', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', padding: '6px 8px', fontSize: 'var(--text-xs)', color: 'var(--ink)' }} />
            <button data-testid="new-project-make" onClick={makeNewProject} disabled={!newName.trim() || making} style={{ all: 'unset', cursor: 'pointer', padding: '6px 10px', borderRadius: 'var(--radius-md)', background: 'var(--accent)', color: 'var(--accent-contrast)', fontSize: 'var(--text-xs)', fontWeight: 700, opacity: newName.trim() ? 1 : 0.45 }}>
              {making ? 'Making...' : 'Make it'}
            </button>
          </div>
        )}
        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 650, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Default for new windows
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <select
            value={currentProject?.projectId || ''}
            onChange={async (e) => {
              const selected = projectsList.find(p => p.id === e.target.value);
              if (selected) {
                const ok = await switchToProject({ path: selected.path, name: selected.name });
                if (ok) onClose();
              }
            }}
            style={{
              flex: 1,
              padding: '6px 8px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--hairline)',
              background: 'var(--surface-2)',
              color: 'var(--ink)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              outline: 'none',
              minWidth: 0,
            }}
          >
            <option value="" disabled>-- Choose a project --</option>
            {projectsList.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.path}
              </option>
            ))}
          </select>
          <button
            title="Open/Add another folder"
            onClick={() => setOpeningProject(o => !o)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              width: 28,
              height: 28,
              borderRadius: 'var(--radius-md)',
              display: 'grid',
              placeItems: 'center',
              background: openingProject ? 'var(--accent-soft)' : 'var(--surface-2)',
              border: '1px solid var(--hairline)',
              color: openingProject ? 'var(--accent-ink)' : 'var(--ink-soft)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5v14" />
            </svg>
          </button>
        </div>
        {projectError && <div style={{ color: 'var(--ps-red)', fontSize: 'var(--text-xs)', lineHeight: 1.35 }}>{projectError}</div>}
        {projectsList.length === 0 && (
          <div style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>
            No local folders yet — add one with + below, or open the Files window to browse.
          </div>
        )}
        <div style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>
          Windows already on the board keep their own project. Click the folder name in any window header to move just that window.
        </div>
      </div>

      {openingProject && (
        <div style={{ padding: '6px 8px 8px', display: 'grid', gap: 6, borderTop: '1px solid var(--hairline)', marginTop: 4 }}>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-soft)' }}>Add/Open Local Path</div>
          <input
            ref={projectInputRef}
            value={projectPath}
            onChange={e => setProjectPath(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitOpenProject();
              if (e.key === 'Escape') { setOpeningProject(false); setProjectError(''); }
            }}
            placeholder="C:\path\to\your\project"
            style={{ all: 'unset', border: '1px solid var(--hairline)', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', padding: '6px 8px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink)' }}
          />
          <input
            value={projectNameInput}
            onChange={e => setProjectNameInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitOpenProject();
              if (e.key === 'Escape') { setOpeningProject(false); setProjectError(''); }
            }}
            placeholder="Project name (optional)"
            style={{ all: 'unset', border: '1px solid var(--hairline)', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', padding: '6px 8px', fontSize: 'var(--text-xs)', color: 'var(--ink)' }}
          />
          {projectError && <div style={{ color: 'var(--ps-red)', fontSize: 'var(--text-xs)', lineHeight: 1.35 }}>{projectError}</div>}
          <button onClick={commitOpenProject} disabled={!projectPath.trim()} style={{ all: 'unset', cursor: projectPath.trim() ? 'pointer' : 'not-allowed', padding: '7px 10px', borderRadius: 'var(--radius-md)', background: 'var(--accent)', color: 'var(--accent-contrast)', fontSize: 'var(--text-xs)', fontWeight: 700, textAlign: 'center', opacity: projectPath.trim() ? 1 : 0.45 }}>Use this folder</button>
        </div>
      )}
    </>
  );
}
