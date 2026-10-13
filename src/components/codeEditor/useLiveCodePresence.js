import React from 'react';
import { reportTyping, reportTextPreview } from '../../lib/collaboration/liveText.js';
import { mergeWithLatest } from '../../lib/collaboration/sharedTextEdit.js';

/**
 * Live-collaboration wiring for the code editor, kept out of
 * CodeEditorWindow.jsx per the size ratchet (existing files may only shrink).
 *
 * - Reports keystrokes + text so peers see live previews.
 * - Applies remote edits even mid-typing: with the shared doc live they are
 *   merged character by character, and the panes keep the caret in place.
 */
export function useLiveCodePresence(win, code, setCode, onUpdate) {
  // Only react to the window's code changing; local typing updates both.
  React.useEffect(() => {
    if (typeof win.code === 'string') setCode((current) => (current === win.code ? current : win.code));
  }, [win.code, setCode]);

  // `base` is what the editor showed before this keystroke; replaying just
  // that edit onto the latest shared code never undoes someone else's typing.
  const updateCode = React.useCallback((typed, base) => {
    const next = typeof base === 'string' ? mergeWithLatest(win.id, 'code', base, typed) : typed;
    setCode(next);
    onUpdate?.({ code: next });
    reportTyping(win.id);
    reportTextPreview(win.id, next);
  }, [win.id, setCode, onUpdate]);

  const focusProps = React.useMemo(() => ({}), []);

  return { updateCode, focusProps };
}
