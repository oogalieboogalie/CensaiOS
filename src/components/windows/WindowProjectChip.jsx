import React from 'react';
import { Icon } from '../Icons.jsx';
import { FolderPicker } from './FolderPicker.jsx';
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
 * Click it to move just this window to another open project, or pick any
 * folder censaiOS can reach. The top-left project menu only sets the
 * default for new windows.
 *
 * A terminal's chip reads "Mount to <folder>" and opens the folder picker
 * straight away: it is the terminal's one mount control (no second bar).
 */
export function WindowProjectChip({ win, onUpdate }) {
  const boardDefault = useWorkspaceStore((s) => s.currentProject);
  const [open, setOpen] = React.useState(false);
  const [serverProjects, setServerProjects] = React.useState([]);
  const [adding, setAdding] = React.useState(false);
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
  };

  const mountsDirect = win.kind === 'terminal';
  const label = project?.name || (mountsDirect ? 'pick a folder' : 'No project');
  const chipTitle = mountsDirect
    ? (project?.path ? `This terminal works in ${project.path}. Click to mount it to another folder.` : 'Mount this terminal to a folder')
    : (project?.path ? `This window works in ${project.path}. Click to pick another project for this window only.` : 'Pick a project for this window');
  return (
    <span ref={wrapRef} className="hb-win-project" data-no-drag>
      <button type="button" className="hb-win-project-chip" data-window-project={project?.path || ''}
        title={chipTitle}
        aria-haspopup={mountsDirect ? 'dialog' : 'menu'} aria-expanded={mountsDirect ? adding : open}
        onClick={(e) => { e.stopPropagation(); if (mountsDirect) setAdding((a) => !a); else setOpen((o) => !o); }}>
        {mountsDirect && <span className="hb-win-project-verb">Mount to</span>}
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
            <button type="button" role="menuitem" className="hb-win-menu-item"
              onClick={(e) => { e.stopPropagation(); setOpen(false); setAdding(true); }}>
              Mount to another folder…
            </button>
          </div>
        </div>
      )}
      {adding && (
        <FolderPicker startPath={project?.path || ''} onClose={() => setAdding(false)} onPick={choose} />
      )}
    </span>
  );
}
