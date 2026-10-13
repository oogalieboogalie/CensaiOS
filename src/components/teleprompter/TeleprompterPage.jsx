/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Prompter } from './Prompter.jsx';
import { normalizePrompter, PROMPTER_KEY, readShared, writeShared } from '../../lib/teleprompter/prompterState.js';

/**
 * The pop-out: just the reader, filling its little window. It reads the
 * script the Teleprompter window last saved and follows every later edit.
 */
export function TeleprompterPage() {
  const [state, setState] = React.useState(() => readShared());
  const latest = React.useRef(state);
  latest.current = state;

  React.useEffect(() => {
    document.title = 'Teleprompter';
    const onStorage = (e) => { if (e.key === PROMPTER_KEY) setState(readShared()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const change = React.useCallback((patch) => {
    const next = normalizePrompter({ ...latest.current, ...patch });
    setState(next);
    writeShared(next);
  }, []);

  return (
    <div className="hb-teleprompter-page">
      <Prompter state={state} onChange={change} globalKeys autoFocus />
    </div>
  );
}

/** True when this page load is the teleprompter pop-out (/?teleprompter=1). */
export function isTeleprompterPage(search = globalThis.location?.search || '') {
  return new URLSearchParams(search).has('teleprompter');
}
