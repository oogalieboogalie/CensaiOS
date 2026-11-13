import React from 'react';
import { caretChannel, clearTextCaret, onCaretChannel, readTextCarets, reportTextCaret } from './textCarets.js';

// React side of live cursors in shared words (textCarets.js).

function useChannel() {
  const [live, setLive] = React.useState(caretChannel);
  React.useEffect(() => {
    setLive(caretChannel());
    return onCaretChannel(setLive);
  }, []);
  return live;
}

const sameCarets = (a, b) => a.length === b.length
  && a.every((c, i) => c.clientId === b[i].clientId && c.index === b[i].index && c.name === b[i].name);

/** Teammates' cursors in one window's words, kept current as they move and as the words change. */
export function useTeammateCarets(windowId, field, enabled = true) {
  const { doc, awareness } = useChannel();
  const [carets, setCarets] = React.useState([]);
  React.useEffect(() => {
    if (!enabled || !doc || !awareness) {
      setCarets((c) => (c.length ? [] : c));
      return undefined;
    }
    const refresh = () => {
      const next = readTextCarets(awareness.getStates(), awareness.clientID, doc, windowId, field);
      setCarets((c) => (sameCarets(c, next) ? c : next));
    };
    refresh();
    awareness.on('change', refresh);
    doc.on('update', refresh);
    return () => {
      awareness.off('change', refresh);
      doc.off('update', refresh);
    };
  }, [doc, awareness, windowId, field, enabled]);
  return carets;
}

/**
 * Tell teammates where this tab's cursor is in a text box (`ref`) while it
 * has focus, and take it away when the box loses focus or goes. The spot is
 * read a moment after each key or click, once the typed letter has reached
 * the shared words. `toShared`, when given, turns the box's spot into a spot
 * in the shared words (a CAD recipe's box holds an unsaved copy).
 */
export function useCaretReporter(ref, windowId, field, enabled = true, toShared = null) {
  const { doc, awareness } = useChannel();
  const mapRef = React.useRef(toShared);
  mapRef.current = toShared;
  React.useEffect(() => {
    const box = ref.current;
    if (!enabled || !box || !doc || !awareness) return undefined;
    let timer = null;
    const send = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (document.activeElement === box) reportTextCaret(windowId, field, mapRef.current ? mapRef.current(box.selectionEnd) : box.selectionEnd);
      }, 0);
    };
    const leave = () => { clearTimeout(timer); clearTextCaret(windowId, field); };
    const events = ['focus', 'input', 'keyup', 'mouseup', 'select'];
    for (const name of events) box.addEventListener(name, send);
    box.addEventListener('blur', leave);
    if (document.activeElement === box) send();
    return () => {
      for (const name of events) box.removeEventListener(name, send);
      box.removeEventListener('blur', leave);
      leave();
    };
  }, [ref, windowId, field, enabled, doc, awareness]);
}
