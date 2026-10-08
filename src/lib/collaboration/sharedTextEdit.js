import { useWorkspaceStore } from '../store.js';
import { mergeLocalEdit } from '../../../server/collab/textDiff.js';

// What a window's text should become after the person typed base -> next,
// given whatever the shared doc has delivered since the editor last rendered.
export function mergeWithLatest(windowId, field, base, next) {
  const win = useWorkspaceStore.getState().wins.find((w) => w.id === windowId);
  return mergeLocalEdit(base, next, win?.[field]);
}
