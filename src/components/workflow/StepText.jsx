import React from 'react';
import { useSharedCaret } from '../../lib/collaboration/useSharedCaret.js';

/**
 * A step's words box. The words merge letter by letter with a teammate's
 * (see windowWorkflowGraph.js), and their letters landing here keep your
 * cursor where it was. `multiline` draws a textarea, otherwise one line.
 */
export function StepText({ value, onChange, multiline = false, ...rest }) {
  const text = String(value ?? '');
  const ref = React.useRef(null);
  useSharedCaret(ref, text);
  const Tag = multiline ? 'textarea' : 'input';
  return <Tag ref={ref} className="hb-wf-input" value={text} onChange={(e) => { if (e.target.value !== text) onChange(e.target.value); }} {...rest} />;
}
