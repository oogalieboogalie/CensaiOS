import React from 'react';
import { keyboardClaimed } from '../../lib/keyboardClaim.js';
import { notePress, pasteOwner, pasteOwnerLine } from '../../lib/pasteOwner.js';
import { logToApp } from '../../lib/appLog/browserLog.js';
import { classifyPastedDesign, suggestDesignSize } from '../../lib/design/designSource.js';
import { useAgentHotkeys } from './useAgentHotkeys.js';

// Global canvas keyboard shortcuts + paste-to-spawn (only for pastes no
// window owns, see pasteOwner.js), extracted from AppContent.jsx.
export function useAppKeyboard({ onNewAgent, onNewWindow, redo, undo, setFocusMode, spawnAt }) {
  // Alt+C Claude Code, Alt+G Copilot CLI… (remappable in Settings → Hotkeys).
  useAgentHotkeys(spawnAt);
  React.useEffect(() => {
    const onKey = (e) => {
      if (keyboardClaimed()) return;
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
      // A paste in a window (a sheet cell, a chat box) or right after a click
      // on one is that window's; the canvas only takes the rest.
      const owner = pasteOwner(e);
      if (owner) {
        logToApp('info', pasteOwnerLine(owner), { where: 'canvas-paste' });
        return;
      }

      const text = e.clipboardData?.getData('text');
      if (!text) return;

      e.preventDefault();

      // Renderable UI lands as a borderless design block; a Figma link opens
      // the Figma importer pre-filled.
      const design = classifyPastedDesign(text);
      if (design?.kind === 'figma') {
        spawnAt('figma', { figmaMode: 'import', figmaFileUrl: design.url });
        return;
      }
      if (design?.kind === 'design') {
        spawnAt('designBlock', {
          title: 'Pasted design',
          source: text,
          sourceType: design.sourceType,
          frameless: true,
          bare: true,
        }, null, suggestDesignSize(design.sourceType, text));
        return;
      }

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
    window.addEventListener('pointerdown', notePress, true);
    return () => {
      window.removeEventListener('paste', handlePaste);
      window.removeEventListener('pointerdown', notePress, true);
    };
  }, [spawnAt]);
}
