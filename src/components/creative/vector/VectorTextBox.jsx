/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { useSharedCaret } from '../../../lib/collaboration/useSharedCaret.js';
import { useCaretReporter, useTeammateCarets } from '../../../lib/collaboration/useTextCarets.js';
import { TeammateCarets } from '../../collaboration/TeammateCarets.jsx';

/** Where a Vector text box's words sit in the window's shared fields. */
export const vectorTextField = (shapeId) => `vs.${shapeId}/text`;

/**
 * The words of the selected Vector text box. A teammate's letters landing in
 * it keep your cursor where it was. On a board, a teammate typing in the same
 * box shows as a line with their name right at the letter, and your cursor
 * goes out to them. Each box is its own words, so a cursor in one box never
 * shows in another. Only a spot goes out, never words.
 */
export function VectorTextBox({ windowId, shapeId, text = '', onType }) {
  const ref = React.useRef(null);
  const field = shapeId ? vectorTextField(shapeId) : null;
  const live = Boolean(windowId && field);
  useSharedCaret(ref, text);
  useCaretReporter(ref, windowId, field, live);
  const carets = useTeammateCarets(windowId, field, live);
  return (
    <div className="hb-cr-textbox">
      <textarea ref={ref} className="hb-cr-input hb-cr-textarea" aria-label="Text" value={text} onChange={(e) => onType(e.target.value)} />
      <TeammateCarets boxRef={ref} carets={carets} text={text} />
    </div>
  );
}
