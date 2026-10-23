import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';
import { raiseWindow } from '../../lib/windowStacking.js';

/**
 * Board selection: a click picks one window and brings it to the front
 * (Ctrl, Cmd or Shift adds or removes it instead); a rubber-band picks
 * many, with the last one active. Clicking empty board clears it.
 */
export function useWindowSelection() {
  const onSelect = React.useCallback((id, event) => {
    const { setActiveId, setSelectedIds, setWins } = useWorkspaceStore.getState();
    if (!id) {
      setActiveId(null);
      setSelectedIds([]);
      return;
    }
    const toggle = Boolean(event?.metaKey || event?.ctrlKey || event?.shiftKey);
    setActiveId(id); setWins((list) => raiseWindow(list, id));
    setSelectedIds((current) => {
      if (!toggle) return [id];
      return current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id];
    });
  }, []);
  const onSelection = React.useCallback((ids) => {
    const { setActiveId, setSelectedIds } = useWorkspaceStore.getState();
    setSelectedIds(ids);
    setActiveId(ids.at(-1) || null);
  }, []);
  return { onSelect, onSelection };
}
