import React from 'react';
import { initialFileLoad } from './fileLoad.js';
import { tryingAgainHelps } from '../../../shared/files/fileProblems.js';

// Save stays off until this path has loaded. A path change drops the previous
// result in the same render, so the button cannot flash on between files.
// `retry` ("Try again") goes back to loading and bumps `attempt`, which the
// reader's effect lists so it reads the file again. It is null while there is
// nothing to try again, or when trying again cannot help (a folder, say).
export function useFileLoadGate(filePath) {
  const path = filePath || '';
  const [loadState, setLoadState] = React.useState(() => initialFileLoad(filePath));
  const [attempt, setAttempt] = React.useState(0);
  if (loadState.path !== path) setLoadState(initialFileLoad(filePath));

  const settle = React.useCallback((status, message = '', reason = '') => {
    setLoadState({ path, status, message, reason });
  }, [path]);

  const retry = React.useCallback(() => {
    setLoadState(initialFileLoad(path));
    setAttempt((n) => n + 1);
  }, [path]);

  const failed = loadState.status === 'failed';
  return {
    loading: loadState.status === 'loading',
    loadError: failed ? loadState.message : '',
    canSave: loadState.status === 'ready',
    settle,
    attempt,
    retry: failed && tryingAgainHelps(loadState.reason) ? retry : null,
  };
}
