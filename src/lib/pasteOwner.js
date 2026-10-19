// Who a paste belongs to: the paste side of the keyboard contract in
// keyboardClaim.js. The canvas turns a paste into a new window (a note, code,
// a design) only when the board itself is where the person is. Anything else
// owns the paste and the canvas stands down:
//   - a window that handled it already (Censai Sheets fills its cells),
//   - a window holding the keyboard (a game, the music player),
//   - a text box or editor, in a window or not,
//   - the window the paste landed in, or the one with the focus inside it,
//   - the window pressed last, while it is open, even when that press left
//     nothing focused in it (its header, a blank part of it).
// A press on the empty board hands focus and selection back from the
// windows (leaveWindows in components/canvas/pointerBuilders.js).
import { keyboardOwner } from './keyboardClaim.js';

const FRAME = '[data-win-id]';
let pressedFrame = null;

const elementOf = (node) => (node?.nodeType === 1 ? node : node?.parentElement || null);
const frameOf = (node) => elementOf(node)?.closest?.(FRAME) || null;

function isTyping(el) {
  if (!el) return false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
  return Boolean(el.isContentEditable || el.closest?.('[contenteditable]:not([contenteditable="false"])'));
}

function frameById(doc, id) {
  for (const frame of doc?.querySelectorAll?.(FRAME) || []) {
    if (frame.getAttribute('data-win-id') === id) return frame;
  }
  return null;
}

const owned = (why, frame, id) => ({
  why,
  kind: frame?.getAttribute?.('data-win-kind') || '',
  id: String(id ?? frame?.getAttribute?.('data-win-id') ?? ''),
});

/** Every press on the page (capture phase): remember the window it landed in. */
export function notePress(event) {
  pressedFrame = frameOf(event?.target);
}

/**
 * null when the canvas may take this paste; otherwise who has it:
 * { why: 'handled' | 'keyboard' | 'typing' | 'inside-window' | 'pressed-window', kind, id }
 */
export function pasteOwner(event, { doc = globalThis.document } = {}) {
  const target = elementOf(event?.target);
  const focused = elementOf(doc?.activeElement);
  // The browser aims a paste at the text selection when there is one, which
  // can sit apart from the focus, and a window that redraws while it handles
  // the paste (the code editor does) leaves the target detached. Either way
  // the focused element still says which window the person is in.
  const frame = frameOf(target) || frameOf(focused);
  if (event?.defaultPrevented) return owned('handled', frame);
  const claimed = keyboardOwner();
  if (claimed !== null) {
    // Claims are named by window id, sometimes behind a prefix ('music:<id>').
    return owned('keyboard', frameById(doc, claimed) || frameById(doc, claimed.split(':').pop()), claimed);
  }
  if (isTyping(target) || isTyping(focused)) return owned('typing', frame);
  if (frame) return owned('inside-window', frame);
  if (pressedFrame?.isConnected) return owned('pressed-window', pressedFrame);
  return null;
}

const BECAUSE = {
  handled: 'took the paste itself',
  keyboard: 'holds the keyboard',
  typing: 'has the cursor in a text box',
  'inside-window': 'is where the paste landed',
  'pressed-window': 'was clicked last (click an empty spot on the board to paste there)',
};

/** The app-log line for a paste the canvas left alone. Never the pasted text. */
export function pasteOwnerLine(owner) {
  if (owner.why === 'typing' && !owner.kind && !owner.id) return 'canvas-paste: left a paste alone, the cursor is in a text box';
  const who = owner.kind ? `the ${owner.kind} window` : owner.id ? `"${owner.id}"` : 'something on the page';
  return `canvas-paste: left a paste alone, ${who} ${BECAUSE[owner.why] || owner.why}`;
}
