import React from 'react';
import { caretChannel, onCaretChannel, sharedText } from './textCarets.js';
import { writerRuns } from '../../../shared/collab/typedBy.js';

// Who typed what in one window's shared words, kept current as anyone types
// (shared/collab/typedBy.js). Null while the board is not shared live, or
// the words are not shared text, or `enabled` is off.

const sameRuns = (a, b) => a === b || (Array.isArray(a) && Array.isArray(b) && a.length === b.length
  && a.every((r, i) => r.text === b[i].text && r.by === b[i].by && r.byId === b[i].byId));

export function useWriters(windowId, field, enabled = true) {
  const [live, setLive] = React.useState(caretChannel);
  const [runs, setRuns] = React.useState(null);
  React.useEffect(() => {
    setLive(caretChannel());
    return onCaretChannel(setLive);
  }, []);
  const { doc } = live;
  React.useEffect(() => {
    if (!enabled || !doc) {
      setRuns(null);
      return undefined;
    }
    const refresh = () => {
      const text = sharedText(doc, windowId, field);
      const next = text ? writerRuns(text.toDelta()) : null;
      setRuns((prev) => (sameRuns(prev, next) ? prev : next));
    };
    refresh();
    doc.on('update', refresh);
    return () => doc.off('update', refresh);
  }, [doc, windowId, field, enabled]);
  return runs;
}
