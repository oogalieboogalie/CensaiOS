import React from 'react';
import { reportTyping, reportTextPreview } from '../../lib/collaboration/liveText.js';

/**
 * Live-collaboration wiring for the code editor, kept out of
 * CodeEditorWindow.jsx per the size ratchet (existing files may only shrink).
 *
 * - Reports keystrokes + text so peers see live previews.
 * - Applies remote previews only while the local textarea is unfocused,
 *   so a peer can never clobber in-progress typing.
 */
export function useLiveCodePresence(win, code, setCode, onUpdate) {
  const editingRef = React.useRef(false);

  React.useEffect(() => {
    if (!editingRef.current && typeof win.code === 'string' && win.code !== code) {
      setCode(win.code);
    }
  }, [win.code, code, setCode]);

  const updateCode = React.useCallback((next) => {
    setCode(next);
    onUpdate?.({ code: next });
    reportTyping(win.id);
    reportTextPreview(win.id, next);
  }, [win.id, setCode, onUpdate]);

  const focusProps = React.useMemo(() => ({
    onFocus: () => { editingRef.current = true; },
    onBlur: () => { editingRef.current = false; },
  }), []);

  return { updateCode, focusProps };
}
