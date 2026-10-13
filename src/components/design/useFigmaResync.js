import React from 'react';
import { figmaApi, resyncPatch } from '../figma/figmaApi.js';

/**
 * Pull a Figma-linked design block's frame again and swap in the fresh code
 * and render. The code it replaces is kept as previousSource, so the block's
 * Undo brings back any edits a person or model made since the last sync.
 */
export function useFigmaResync({ win, liveSource, onUpdate, onSourceChange }) {
  const [state, setState] = React.useState({ busy: false, error: '' });
  const figma = win.figma;
  const canSync = Boolean(figma?.url && figma?.nodeId);

  const sync = React.useCallback(async () => {
    if (!canSync || state.busy) return;
    setState({ busy: true, error: '' });
    try {
      const result = await figmaApi.importFrame(figma.url, figma.nodeId);
      onUpdate?.(resyncPatch(win, result, liveSource));
      if (result.html !== liveSource) onSourceChange?.(result.html);
      setState({ busy: false, error: '' });
    } catch (err) {
      setState({ busy: false, error: err.message });
    }
  }, [canSync, state.busy, figma, liveSource, win, onUpdate, onSourceChange]);

  return { canSync, sync, busy: state.busy, error: state.error };
}
