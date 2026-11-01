import { useWorkspaceStore } from '../store.js';
import { mergeLocalEditOp } from '../../../shared/collab/textDiff.js';
import { noteLocalEdit, remoteOps } from './remoteTextEdits.js';

// What a window's text should become after the person typed base -> next,
// given whatever the shared doc has delivered since the editor last rendered.
// `caret` (where the caret ended up) pins the typed spot in repeated letters.
export function mergeWithLatest(windowId, field, base, next, caret = null) {
  const win = useWorkspaceStore.getState().wins.find((w) => w.id === windowId);
  const latest = win?.[field];
  const theirs = typeof latest === 'string' ? remoteOps(windowId, field, base, latest) : null;
  const { text, op } = mergeLocalEditOp(base, next, latest, { caret, theirs });
  noteLocalEdit(windowId, field, text, op);
  return text;
}
