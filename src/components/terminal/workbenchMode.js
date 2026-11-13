// Two views of one shell. A window that has never chosen a view stays on the
// plain terminal, so a saved shell opens exactly as it did before the switch.

export const WORKBENCH_VIEW = 'workbench';
export const PLAIN_VIEW = 'plain';

export function terminalView(win) {
  return win?.terminalView === WORKBENCH_VIEW ? WORKBENCH_VIEW : PLAIN_VIEW;
}

export function isWorkbenchView(win) {
  return terminalView(win) === WORKBENCH_VIEW;
}
