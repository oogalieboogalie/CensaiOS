// Teammates' cursors inside the Code Editor's CodeMirror pane: a thin line in
// their colour where they are typing, with their name on a small tag, drawn
// by CodeMirror itself so it scrolls, wraps and moves with the code. This
// tab's own cursor goes out to teammates while the editor has focus, and is
// taken away when it loses focus. Only a spot in the shared code goes out
// (textCarets.js), never the code. No React here.
import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { clearTextCaret, reportTextCaret } from '../../lib/collaboration/textCarets.js';

/** The window field that holds a Code Editor's shared code. */
export const CODE_FIELD = 'code';

class TeammateCaretWidget extends WidgetType {
  constructor(caret) {
    super();
    this.caret = caret;
  }

  eq(other) {
    const a = this.caret;
    const b = other.caret;
    return a.clientId === b.clientId && a.name === b.name && a.color === b.color && a.index === b.index && a.below === b.below;
  }

  toDOM() {
    const { name, color, index, below } = this.caret;
    const mark = document.createElement('span');
    mark.className = 'hb-code-caret';
    mark.setAttribute('data-teammate-caret', name);
    mark.setAttribute('data-at', String(index));
    if (below) mark.setAttribute('data-tag-below', 'true');
    mark.setAttribute('aria-hidden', 'true');
    mark.style.setProperty('--caret-color', color);
    const tag = document.createElement('span');
    tag.className = 'hb-code-caret__tag';
    tag.textContent = name;
    mark.appendChild(tag);
    return mark;
  }

  ignoreEvent() {
    return true;
  }
}

/** Hand the editor the latest teammates' cursors: [{ clientId, index, name, color }]. */
export const setTeammateCarets = StateEffect.define();

/** The cursors as CodeMirror marks, each at its spot (kept inside the code). */
export function caretMarks(carets, doc) {
  const marks = (carets || []).map((c) => {
    const index = Math.max(0, Math.min(Number(c.index) || 0, doc.length));
    // On the first line the name sits under the cursor, inside the editor.
    const below = doc.lineAt(index).number === 1;
    return Decoration.widget({ widget: new TeammateCaretWidget({ ...c, index, below }), side: 1 }).range(index);
  });
  return Decoration.set(marks, true);
}

/** Holds the marks; between updates they move with the code typed around them. */
export const teammateCaretsField = StateField.define({
  create: () => Decoration.none,
  update(marks, tr) {
    let next = marks.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setTeammateCarets)) next = caretMarks(effect.value, tr.state.doc);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/**
 * Tell teammates where this tab's cursor is in a window's code while the
 * editor has focus. The spot is read a moment after each change, once the
 * typed letter has reached the shared code.
 */
export function codeCaretReporter(windowId, field = CODE_FIELD) {
  let timer = null;
  return EditorView.updateListener.of((update) => {
    const { view } = update;
    if (update.focusChanged && !view.hasFocus) {
      clearTimeout(timer);
      clearTextCaret(windowId, field);
      return;
    }
    if (!view.hasFocus || !(update.selectionSet || update.docChanged || update.focusChanged)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (view.hasFocus) reportTextCaret(windowId, field, view.state.selection.main.head);
    }, 0);
  });
}
