import React from 'react';

// Global canvas keyboard shortcuts + paste-to-spawn, extracted from
// AppContent.jsx with no logic changes.
export function useAppKeyboard({ onNewAgent, onNewWindow, redo, undo, setFocusMode, spawnAt }) {
  React.useEffect(() => {
    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      const editing = ['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.contentEditable === 'true';
      if (meta && !editing && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      else if (meta && !editing && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      if (meta && e.key.toLowerCase() === 'n') { e.preventDefault(); onNewAgent(); }
      else if (meta && e.key.toLowerCase() === 'w') { e.preventDefault(); onNewWindow(); }
      else if (meta && e.key.toLowerCase() === 'f') { e.preventDefault(); setFocusMode(f => !f); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNewAgent, onNewWindow, redo, setFocusMode, undo]);

  React.useEffect(() => {
    const handlePaste = (e) => {
      const editing = ['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.contentEditable === 'true';
      if (editing) return;

      const text = e.clipboardData?.getData('text');
      if (!text) return;

      e.preventDefault();

      // Simple heuristic: if it has common programming language keywords, brackets, etc.
      // or HTML-like tags, treat it as code.
      const startsLikeCode = /^\s*(?:import|export|const|let|var|function|class|def|public|private|package|using|#include)\b/m.test(text);
      const isCode = startsLikeCode || /[{}]|<\/?[a-z][\s\S]*>/i.test(text);

      if (isCode) {
        spawnAt('code_editor', {
          title: 'Pasted Code',
          code: text,
        });
      } else {
        spawnAt('doc', {
          fileName: 'Pasted Note.md',
          text: text,
        });
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [spawnAt]);
}
