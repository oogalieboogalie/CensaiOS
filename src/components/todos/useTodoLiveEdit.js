import React from 'react';

// Editing a to-do's words. Each letter is saved to the board as you type, so
// a teammate sees it at once and two people typing in one to-do merge letter
// by letter (src/lib/collaboration/todoItemText.js). Your latest letters show
// straight away and give way as soon as the board's copy arrives. Enter or
// clicking away keeps the words (tidied); Escape puts back the words from
// before you started, unless a teammate typed in it too (then theirs stay).
const rawItems = (win) => (Array.isArray(win.items) ? win.items.filter(Boolean) : []);

// `saveOnServer`: a list kept on the server also hears the final words.
export function useTodoLiveEdit(win, onUpdate, persistItemPatch, saveOnServer = false) {
  const [editingId, setEditingId] = React.useState(null);
  const startRef = React.useRef({ text: '', lastTyped: null });
  const raw = rawItems(win);
  const editing = editingId === null ? null : raw.find((it) => String(it.id) === String(editingId));
  const shared = editing ? String(editing.text ?? '') : '';
  const [mine, setMine] = React.useState({ shared, text: null });
  if (mine.shared !== shared) setMine({ shared, text: null });
  const editText = mine.shared === shared && mine.text !== null ? mine.text : shared;

  // A to-do a teammate removed can't be edited any more.
  React.useEffect(() => { if (editingId !== null && !editing) setEditingId(null); }, [editingId, editing]);

  const writeLive = (text) => {
    onUpdate({ items: rawItems(win).map((it) => (String(it.id) === String(editingId) ? { ...it, text } : it)) });
  };
  const setEditText = (text) => {
    if (!editing) return;
    startRef.current.lastTyped = text;
    setMine((m) => ({ ...m, text }));
    writeLive(text);
  };
  const startEdit = (id, text) => {
    startRef.current = { text: String(text ?? ''), lastTyped: null };
    setEditingId(id);
  };
  const saveEdit = () => {
    if (editing) {
      const tidy = editText.trim();
      const { text: before } = startRef.current;
      if (!tidy) writeLive(before);
      else if (tidy !== editText || (saveOnServer && tidy !== before)) persistItemPatch(editing.id, { text: tidy });
    }
    setEditingId(null);
  };
  const cancelEdit = () => {
    const { text: before, lastTyped } = startRef.current;
    if (editing && lastTyped !== null && shared === lastTyped) writeLive(before);
    setEditingId(null);
  };
  return { editingId, editText, setEditText, startEdit, saveEdit, cancelEdit };
}
