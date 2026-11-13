import React, { useRef } from 'react';
import { useTerminal } from './useTerminal.js';

// One tab's shell. Hidden tabs stay mounted so their shells keep running and
// their output keeps arriving while another tab is in front.
export function TerminalPane({ win, cwd, theme, workspaceId, sessionId, plain, active, glow, shown = true }) {
  const hostRef = useRef(null);
  const shownRef = useRef(shown);
  const { termRef } = useTerminal(hostRef, win, cwd, theme, workspaceId, { sessionId, plain });

  React.useEffect(() => {
    if (active && win.activeTerminalTab) termRef.current?.focus();
  }, [active]);

  // Workbench hides this pane without unmounting it. Focus again when it
  // comes back, so the same shell takes typing where it left off.
  React.useEffect(() => {
    const revealed = shown && shownRef.current === false;
    shownRef.current = shown;
    if (revealed && active) termRef.current?.focus();
  }, [shown, active]);

  const translucent = win.opacity !== undefined;
  const classes = [translucent ? 'terminal-translucent' : '', glow ? 'terminal-glow' : ''].filter(Boolean).join(' ');
  return (
    <div
      ref={hostRef}
      className={classes}
      data-terminal-tab={sessionId}
      onPointerDown={(event) => {
        event.stopPropagation();
        termRef.current?.focus();
      }}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
      onPaste={(event) => {
        event.preventDefault();
        const text = event.clipboardData?.getData('text');
        if (text && termRef.current) termRef.current.paste(text);
      }}
      style={{
        display: active ? 'block' : 'none',
        flex: 1,
        minHeight: 0,
        padding: 0,
        background: translucent ? 'transparent' : theme.background,
        overflow: 'hidden',
        cursor: 'text',
        userSelect: 'text',
        WebkitUserSelect: 'text',
        zoom: 1,
      }}
    />
  );
}
