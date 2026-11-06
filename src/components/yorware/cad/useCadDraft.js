// My unsaved edits to a CAD recipe. When a teammate runs their own change
// while I am still editing, their change is merged into my copy (and my
// caret stays put), so my Run later keeps both. See draftText.js.
import React from 'react';
import { rebaseDraft, startDraft, typeInDraft } from '../../../lib/collaboration/draftText.js';
import { remoteOps } from '../../../lib/collaboration/remoteTextEdits.js';

export const CAD_CODE_FIELD = 'cadCode';

export function useCadDraft(boardCode, winId) {
  const [draft, setDraftState] = React.useState(null);
  const track = React.useRef(null);

  let value = draft;
  const copy = track.current;
  if (copy && draft !== null && copy.board !== boardCode) {
    const theirs = remoteOps(String(winId), CAD_CODE_FIELD, copy.board, boardCode);
    value = rebaseDraft(copy, boardCode, theirs);
    if (value !== draft) setDraftState(value);
  }

  const setDraft = React.useCallback((next, caret = null) => {
    if (next === null) { track.current = null; setDraftState(null); return; }
    if (!track.current) track.current = startDraft(boardCode);
    setDraftState(typeInDraft(track.current, next, caret));
  }, [boardCode]);

  const clear = React.useCallback(() => { track.current = null; setDraftState(null); }, []);

  return { draft: value, setDraft, clear };
}
