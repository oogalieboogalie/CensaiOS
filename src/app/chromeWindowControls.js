export function getActiveWindow(wins, activeId) {
  if (!activeId) return null;
  return wins.find((win) => win.id === activeId) || null;
}

export function getChromeWindowControlState({ wins, activeId, focusMode }) {
  const activeWindow = getActiveWindow(wins, activeId);
  return {
    activeWindow,
    minimizeTitle: activeWindow
      ? (activeWindow.pinned ? 'Unpin selected window' : 'Pin selected window')
      : 'Pin selected window',
    maximizeTitle: activeWindow
      ? (activeWindow.maximized ? 'Restore selected window' : 'Maximize selected window')
      : (focusMode ? 'Exit focus mode' : 'Focus mode'),
    closeTitle: activeWindow ? 'Close selected window' : 'Close selected window',
    showWindowMaximize: Boolean(activeWindow),
  };
}

export function runChromeMinimizeAction({ wins, activeId, onUpdate }) {
  const activeWindow = getActiveWindow(wins, activeId);
  if (!activeWindow) return false;
  onUpdate(activeId, { pinned: !activeWindow.pinned });
  return true;
}

export function runChromeMaximizeAction({ wins, activeId, onUpdate, onToggleFocus }) {
  const activeWindow = getActiveWindow(wins, activeId);
  if (activeWindow) {
    onUpdate(activeId, { maximized: !activeWindow.maximized });
    return 'window';
  }
  onToggleFocus();
  return 'focus';
}

export function runChromeCloseAction({ activeId, onClose }) {
  if (!activeId) return false;
  onClose(activeId);
  return true;
}
