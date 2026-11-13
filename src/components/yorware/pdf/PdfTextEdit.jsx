/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { useSharedCaret } from '../../../lib/collaboration/useSharedCaret.js';
import { useCaretReporter, useTeammateCarets } from '../../../lib/collaboration/useTextCarets.js';
import { TeammateCarets } from '../../collaboration/TeammateCarets.jsx';
import { TeammatesHere } from '../../office/docs/TeammatesHere.jsx';
import { markKey } from '../../../lib/yorware/pdfModel.js';

/** Where the words of a text box placed on a PDF page sit in the window's shared fields. */
export const pdfTextField = (markId) => `${markKey(markId)}/text`;

/**
 * The typing box shown while you edit a text box on a page. A teammate's
 * letters landing in it keep your cursor where it was. On a board, a teammate
 * typing in the same box shows as a line with their name right at the
 * letter, and your cursor goes out to them. Only a spot goes out, never words.
 */
export function PdfTextEdit({ windowId, markId, text = '', style, onText, onEndEdit }) {
  const ref = React.useRef(null);
  const field = markId ? pdfTextField(markId) : null;
  const live = Boolean(windowId && field);
  useSharedCaret(ref, text);
  useCaretReporter(ref, windowId, field, live);
  const carets = useTeammateCarets(windowId, field, live);
  return (
    <div className="hb-yp-text-box">
      <textarea ref={ref} className="hb-yp-text-edit" aria-label="Text on the page" style={style} value={text} autoFocus
        onFocus={(e) => e.target.select()} onChange={(e) => onText(e.target.value)} onBlur={onEndEdit}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); e.currentTarget.blur(); } }} />
      <TeammateCarets boxRef={ref} carets={carets} text={text} />
    </div>
  );
}

// A text box on the page you are not typing in: each teammate typing in it
// gets a small name tag in their colour at the box's top right corner.
// Double-click into the box and their cursor shows right at the letter.
export function PdfTextHere({ windowId, markId }) {
  const field = markId ? pdfTextField(markId) : null;
  const carets = useTeammateCarets(windowId, field, Boolean(windowId && field));
  return <TeammatesHere carets={carets} />;
}
