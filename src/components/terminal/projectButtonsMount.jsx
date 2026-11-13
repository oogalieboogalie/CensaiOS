import { createRoot } from 'react-dom/client';
import { useWorkspaceStore } from '../../lib/store.js';
import { activeTerminalTabId, tabSessionId } from './terminalTabs.js';
import { ProjectButtons } from './ProjectButtons.jsx';
import { loadProjectButtons, typeCommand } from './projectButtons.js';

function windowFor(host) {
  const id = host.closest?.('[data-win-id]')?.getAttribute('data-win-id');
  if (!id) return null;
  return (useWorkspaceStore.getState().wins || []).find((win) => win.id === id) || null;
}

function place(mount, parent) {
  if (!parent) return;
  if (!parent.dataset.jobsPosition && getComputedStyle(parent).position === 'static') {
    parent.dataset.jobsPosition = 'static';
    parent.style.position = 'relative';
  }
  parent.appendChild(mount);
}

function unplace(mount) {
  const parent = mount?.parentElement;
  mount?.remove();
  if (!parent?.dataset.jobsPosition) return;
  if (parent.querySelector('.hb-jobs-mount')) return;
  parent.style.position = '';
  delete parent.dataset.jobsPosition;
}

// The buttons sit on the right of the shell that is in front, and only in
// the Workbench view. The command is typed into that same shell.
export function attachProjectButtons(term, host) {
  if (!term || !host) return () => {};
  let mount = null;
  let root = null;
  let token = 0;
  let key = '';

  const clear = () => {
    root?.unmount();
    root = null;
    unplace(mount);
    mount = null;
    key = '';
  };

  const draw = () => {
    const win = windowFor(host);
    const mine = host.getAttribute?.('data-terminal-tab') || '';
    const active = win ? tabSessionId(win, { id: activeTerminalTabId(win) }) : '';
    if (!win || win.terminalView !== 'workbench' || !mine || mine !== active) {
      clear();
      return;
    }
    const next = `${win.cwd || ''}|${mine}`;
    if (next === key && root) return;
    key = next;
    if (!mount) {
      mount = document.createElement('div');
      mount.className = 'hb-jobs-mount';
      const slot = host.closest?.('[data-win-frame]')?.querySelector?.('[data-terminal-view="workbench"]');
      place(mount, slot || host.parentElement || host);
      root = createRoot(mount);
    }
    const here = ++token;
    const run = (command) => typeCommand(term, command);
    loadProjectButtons(win.cwd).then((buttons) => {
      if (here !== token || !root) return;
      root.render(<ProjectButtons buttons={buttons} onRun={run} />);
    }).catch(() => {});
  };

  draw();
  const unsubscribe = useWorkspaceStore.subscribe(draw);
  return () => {
    token += 1;
    unsubscribe();
    clear();
  };
}
