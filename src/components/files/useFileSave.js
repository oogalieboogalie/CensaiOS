import React from 'react';
import { notSavedWords } from '../../../shared/files/fileProblems.js';
import { saveFileContent } from './fileSave.js';

const SAVED_NOTE_MS = 3000;

/**
 * Save for a window on a file on this computer (Document, Code editor).
 * `save(content)` writes it, and `note` says it saved (for a moment) or that
 * it was not saved and why, until a save works or it is closed. What was
 * typed stays in the window either way.
 */
export function useFileSave(filePath, name, kind, onSaved) {
  const [saving, setSaving] = React.useState(false);
  const [note, setNote] = React.useState(null);
  const hide = React.useRef(null);
  const busy = React.useRef(false);
  const queued = React.useRef(null);
  const fileNow = React.useRef(filePath);
  fileNow.current = filePath;
  const label = name || String(filePath || '').split(/[\\/]/).pop() || 'This file';

  React.useEffect(() => () => clearTimeout(hide.current), []);
  // A note is about this window's file only.
  React.useEffect(() => {
    clearTimeout(hide.current);
    setNote(null);
  }, [filePath]);

  const show = (saved) => {
    clearTimeout(hide.current);
    if (!saved.ok) return setNote({ kind: 'error', text: notSavedWords(label, saved.why, saved.unsure) });
    setNote({ kind: 'ok', text: `Saved ${label}.` });
    hide.current = setTimeout(() => setNote(null), SAVED_NOTE_MS);
  };

  // One save on its way at a time: a Save pressed meanwhile (Ctrl+S) saves
  // the newest words once it is answered, and only the newest answer shows.
  const save = async (content) => {
    const ask = { content, filePath };
    if (busy.current) {
      queued.current = ask;
      return;
    }
    busy.current = true;
    setSaving(true);
    for (let next = ask; next; next = queued.current) {
      queued.current = null;
      const saved = await saveFileContent(next.filePath, next.content, kind);
      // An answer about a file this window no longer shows is not said here.
      const sameFile = fileNow.current === next.filePath;
      if (saved.ok && sameFile) onSaved?.(next.content);
      if (sameFile && !queued.current) show(saved);
    }
    busy.current = false;
    setSaving(false);
  };

  const closeNote = () => {
    clearTimeout(hide.current);
    setNote(null);
  };

  return { saving, note, save, closeNote };
}
