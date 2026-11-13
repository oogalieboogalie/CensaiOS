import { createRoot } from 'react-dom/client';
import { CommandCards } from './CommandCards.jsx';
import { presentCommands } from './commandCards.js';
import { peekSessionLog, sessionLog, sessionReplayed, watchSessionLog } from './commandLog.js';
import { activeTerminalTabId, tabSessionId } from './terminalTabs.js';

// Cards show only in the Workbench view, and only for the shell in front.
// The round buttons and the view switch live in other changes, so this
// draws into the workbench slot when that slot is already on the page, and
// above the shell when it is not.
export function shouldShowCards(win, sessionId) {
  if (win?.terminalView !== 'workbench') return false;
  const active = tabSessionId(win, { id: activeTerminalTabId(win) });
  return active === sessionId;
}

export function mountCommandCards({ host, sessionId }) {
  if (!host) return () => {};
  const frame = host.closest?.('[data-win-frame]');
  const slot = frame?.querySelector?.('[data-terminal-view="workbench"]') || null;
  const mount = document.createElement('div');
  mount.className = 'hb-cmd-mount';
  if (slot) slot.appendChild(mount);
  else {
    host.classList.add('hb-cmd-cover');
    (host.parentElement || host).appendChild(mount);
  }
  const root = createRoot(mount);
  let log = sessionLog(sessionId);
  let unsubscribe = () => {};
  const draw = () => {
    const current = log;
    root.render(
      <CommandCards
        cards={current ? presentCommands(current.list()) : []}
        replayed={Boolean(current) && sessionReplayed(sessionId)}
        onRun={(command) => current?.run(command)}
      />,
    );
  };
  // The shell drops this log when the folder changes, then makes a new one.
  const follow = () => {
    const next = peekSessionLog(sessionId);
    if (next === log) return;
    unsubscribe();
    log = next;
    unsubscribe = next ? next.subscribe(draw) : () => {};
    draw();
  };
  unsubscribe = log.subscribe(draw);
  const unwatch = watchSessionLog(sessionId, follow);
  draw();
  return () => {
    unwatch();
    unsubscribe();
    const dying = root;
    const node = mount;
    // The terminal is still rendering. Unmounting this root now makes React
    // warn and the view switch fails. Wait until that render has finished.
    queueMicrotask(() => {
      dying.unmount();
      node.remove();
      if (!slot && !host.querySelector?.('.hb-cmd-mount')) host.classList.remove('hb-cmd-cover');
    });
  };
}
