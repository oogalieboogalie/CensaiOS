// Which pointer-down targets may start a window move.

const INTERACTIVE = 'button, a, input, select, textarea, label, [role="button"], [role="menuitem"], [role="menu"], [contenteditable="true"], [data-no-drag]';

// Editors where Alt-drag already means rectangular / column selection.
const ALT_SELECT_SURFACES = '.cm-editor, .monaco-editor, .xterm, [data-alt-drag="off"]';

/** Header background, title and icon move the window; its controls do not. */
export function isHeaderDragTarget(target, headerEl) {
  if (!headerEl || !target || !headerEl.contains(target)) return false;
  const interactive = target.closest?.(INTERACTIVE);
  return !interactive || !headerEl.contains(interactive);
}

/** Alt-drag moves the window from anywhere except column-select editors. */
export function isAltDragTarget(target) {
  return !target?.closest?.(ALT_SELECT_SURFACES);
}
