import React from 'react';
import { useSharedCaret } from '../../lib/collaboration/useSharedCaret.js';
import { useCaretReporter, useTeammateCarets } from '../../lib/collaboration/useTextCarets.js';
import { TeammateCarets } from '../collaboration/TeammateCarets.jsx';

/** Where one step's words sit in a Workflow window's shared fields. */
export const stepTextField = (index, key) => `graph/nodes/${index}/${key}`;

/**
 * A step's words box. The words merge letter by letter with a teammate's
 * (see windowWorkflowGraph.js), and their letters landing here keep your
 * cursor where it was. On a board (`winId` and `field` given), a teammate
 * typing in the same box shows as a line with their name at the letter, and
 * your cursor goes out to them while you type: only the spot, never the
 * words. `multiline` draws a textarea, otherwise one line.
 */
export function StepText({ value, onChange, multiline = false, winId, field, ...rest }) {
  const text = String(value ?? '');
  const ref = React.useRef(null);
  const live = Boolean(winId && field);
  useSharedCaret(ref, text);
  useCaretReporter(ref, winId, field, live);
  const carets = useTeammateCarets(winId, field, live);
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <span className="hb-wf-textbox">
      <Tag ref={ref} className="hb-wf-input" value={text} onChange={(e) => { if (e.target.value !== text) onChange(e.target.value); }} {...rest} />
      <TeammateCarets boxRef={ref} carets={carets} text={text} />
    </span>
  );
}
