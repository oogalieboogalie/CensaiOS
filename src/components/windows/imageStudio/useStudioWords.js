import React from 'react';

// Image Studio's prompt and its additional instructions live on the window
// itself (`prompt` and `imageNotes`) and are saved as you type, so two people
// on one board write them together, letter by letter (see
// shared/collab/textDiff.js). Before, both sat inside the studio's saved
// picture state, so one screen never saw the other's words and the last one
// to type replaced the other's. Windows saved before this still show their
// old words until someone first edits them.
const words = (live, old) => {
  if (typeof live === 'string') return live;
  return typeof old === 'string' ? old : '';
};

export function useStudioWords(win, onUpdate) {
  const saved = win.state?.imageStudio || win.canvasState || {};
  const prompt = words(win.prompt, saved.prompt);
  const notes = words(win.imageNotes, saved.additionalInstructions);
  const setPrompt = React.useCallback((next) => onUpdate?.({ prompt: String(next ?? '') }), [onUpdate]);
  const setNotes = React.useCallback((next) => onUpdate?.({ imageNotes: String(next ?? '') }), [onUpdate]);
  return { prompt, notes, setPrompt, setNotes };
}
