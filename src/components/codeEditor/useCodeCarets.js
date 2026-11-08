import React from 'react';
import { useTeammateCarets } from '../../lib/collaboration/useTextCarets.js';
import { clearTextCaret } from '../../lib/collaboration/textCarets.js';
import { CODE_FIELD, codeCaretReporter, setTeammateCarets, teammateCaretsField } from './teammateCodeCarets.js';

/**
 * Live cursors for the Code Editor's CodeMirror pane (teammateCodeCarets.js).
 * `windowId` is null for code that stays on this screen (a file only the
 * owner may read): then nothing goes out and nobody's cursor is drawn.
 * Returns the CodeMirror extensions to add to the editor.
 */
export function useCodeCarets(view, windowId) {
  const on = Boolean(windowId);
  const carets = useTeammateCarets(windowId, CODE_FIELD, on);
  React.useEffect(() => {
    if (!view) return;
    view.dispatch({ effects: setTeammateCarets.of(on ? carets : []) });
  }, [view, carets, on]);
  // Leaving the window (closing it) takes our cursor away too.
  React.useEffect(() => (on ? () => clearTextCaret(windowId, CODE_FIELD) : undefined), [on, windowId]);
  return React.useMemo(
    () => (on ? [teammateCaretsField, codeCaretReporter(windowId)] : [teammateCaretsField]),
    [on, windowId],
  );
}
