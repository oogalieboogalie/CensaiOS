import React from 'react';
import { Icon } from '../Icons.jsx';
import { api } from '../../lib/api.js';
import { useWorkspaceStore } from '../../lib/store.js';
import { boardProjects, isProjectAware, projectPatch, resolveWindowProject, samePath } from '../../lib/windowProject.js';

async function fetchOpenProjects() {
  const res = await fetch('/api/open-projects');
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data?.projects) ? data.projects : [];
}

/**
 * Multi-project board: the project a window works in, shown in its header.
 * Click it to move just this window to another open project or folder. The
 * top-left project menu only sets the default for new windows.
 */
export function WindowProjectChip({ win, onUpdate }) {
  const boardDefault = useWorkspaceStore((s) => s.currentProject);
  const [open, setOpen] = React.useState(false);
  const [serverProjects, setServerProjects] = React.useState([]);
  const [adding, setAdding] = React.useState(false);
  const [folderInput, setFolderInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const wrapRef = React.useRef(null);

  // A string key keeps the subscription stable: the header re-renders only
  // when this window's project actually changes, not on every window move.
  const projectKey = useWorkspaceStore((s) => {
    const self = s.wins.find((w) => w.id === win.id) || win;
    const p = resolveWindowProject(self, { wins: s.wins, canvasGroups: s.canvasGroups, boardDefault: s.currentProject });
    return p?.path ? `${p.path}\n${p.name || ''}` : '';
  });
  const [projectPath, projectName] = projectKey.split('\n');
  const project = projectPath ? { path: projectPath, name: projectName } : null;

  React.useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    fetchOpenProjects().then((list) => { if (alive) setServerProjects(list); }).catch(() => {});
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      alive = false;
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!isProjectAware(win)) return null;

  // Everything open on the board: what the server knows plus every folder a
  // window already works in.
  // Read lazily (only while the menu is open) so a header never re-renders
  // on every window move.
  const choices = [];
  const onBoard = open ? boardProjects(useWorkspaceStore.getState().wins, boardDefault) : [];
  for (const p of [...serverProjects, ...onBoard]) {
    if (p?.path && !choices.some((c) => samePath(c.path, p.path))) choices.push(p);
  }

  const choose = (next) => {
    onUpdate(projectPatch(win, next));
    setOpen(false);
    setAdding(false);
    setError('');
  };

  const openFolder = async (e) => {
    e?.preventDefault();
    const path = folderInput.trim();
    if (!path || busy) return;
    setBusy(true);
    setError('');
    try {
      const opened = await api.openProject({ path });
      choose({ name: opened?.name, path: opened?.path || path, projectId: opened?.id });
      setFolderInput('');
    } catch (err) {
      setError(err.message || 'Could not open that folder');
    } finally {
      setBusy(false);
    }
  };

  const label = project?.name || 'No project';
  return (
    <span ref={wrapRef} className="hb-win-project" data-no-drag>
      <button type="button" className="hb-win-project-chip" data-window-project={project?.path || ''}
        title={project?.path ? `This window works in ${project.path}. Click to pick another project for this window only.` : 'Pick a project for this window'}
        aria-haspopup="menu" aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
        <Icon.Folder size={12} />
        <span className="hb-win-project-name">{label}</span>
      </button>
      {open && (
        <div className="hb-win-menu hb-win-project-menu" role="menu" aria-label="Project for this window"
          onPointerDown={(e) => e.stopPropagation()}>
          <span className="hb-win-menu-label">Project for this window</span>
          {choices.length === 0 && <span className="hb-win-project-empty">No projects open yet.</span>}
          {choices.map((p) => {
            const isDefault = samePath(p.path, boardDefault?.path);
            return (
              <button key={p.path} type="button" role="menuitemradio" className="hb-win-menu-item"
                aria-checked={samePath(p.path, project?.path)} title={p.path}
                onClick={(e) => { e.stopPropagation(); choose(p); }}>
                <span className="hb-win-project-row">
                  <span className="hb-win-project-title">
                    {p.name || p.path}
                    {isDefault && <span className="hb-win-project-tag" title="The top-left project menu: new windows start here">default</span>}
                  </span>
                  <span className="hb-win-project-path">{p.path}</span>
                </span>
              </button>
            );
          })}
          <div className="hb-win-menu-section">
            {adding ? (
              <form className="hb-win-project-form" onSubmit={openFolder}>
                <input autoFocus value={folderInput} onChange={(e) => setFolderInput(e.target.value)}
                  placeholder="D:\Projects\my-site" aria-label="Folder to open in this window" />
                <button type="submit" className="hb-win-action" disabled={!folderInput.trim() || busy}>
                  {busy ? 'Opening…' : 'Open'}
                </button>
              </form>
            ) : (
              <button type="button" role="menuitem" className="hb-win-menu-item"
                onClick={(e) => { e.stopPropagation(); setAdding(true); }}>
                Open another folder…
              </button>
            )}
            {error && <span className="hb-win-project-error">{error}</span>}
          </div>
        </div>
      )}
    </span>
  );
}
