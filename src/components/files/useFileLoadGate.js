import React from 'react';
import { initialFileLoad } from './fileLoad.js';

// Save stays off until this path has loaded. A path change drops the previous
// result in the same render, so the button cannot flash on between files.
export function useFileLoadGate(filePath) {
  const path = filePath || '';
  const [loadState, setLoadState] = React.useState(() => initialFileLoad(filePath));
  if (loadState.path !== path) setLoadState(initialFileLoad(filePath));

  const settle = React.useCallback((status, message = '') => {
    setLoadState({ path, status, message });
  }, [path]);

  return {
    loading: loadState.status === 'loading',
    loadError: loadState.status === 'failed' ? loadState.message : '',
    canSave: loadState.status === 'ready',
    settle,
  };
}
