// Format + ask-agent actions for the code editor window. Kept out of
// CodeEditorWindow.jsx per the size ratchet (existing files may only shrink).

import React from 'react';
import { formatDocument, formatSelectionFragment } from './codeFormatter.js';
import { displayNameForLanguage, isFormattableLanguage } from './languageDetect.js';

export function buildFixPrompt({ fileLabel, language, selectionText }) {
  const langName = displayNameForLanguage(language);
  return `In ${fileLabel} (${langName}), please fix and format this snippet and return the corrected code:\n\n\`\`\`${language}\n${selectionText}\n\`\`\``;
}

export function useCodeEditorActions({ code, setCode, language, fileLabel, onUpdate, onSpawn, agentId }) {
  const [formatStatus, setFormatStatus] = React.useState(null); // { kind, text }
  const canFormat = isFormattableLanguage(language);

  const flash = React.useCallback((kind, text) => {
    setFormatStatus({ kind, text });
    window.setTimeout(() => {
      setFormatStatus((current) => (current?.text === text ? null : current));
    }, 3200);
  }, []);

  const applyFormatted = React.useCallback((next, verb) => {
    if (next === code) {
      flash('ok', 'Already formatted');
      return;
    }
    setCode(next);
    onUpdate?.({ code: next });
    flash('ok', verb);
  }, [code, setCode, onUpdate, flash]);

  const formatWhole = React.useCallback(async () => {
    const res = await formatDocument(code, language);
    if (res.ok) applyFormatted(res.code, 'Formatted');
    else flash('error', res.error);
  }, [code, language, applyFormatted, flash]);

  const formatRange = React.useCallback(async (selection) => {
    if (!selection?.text) return;
    const frag = await formatSelectionFragment(selection.text, language);
    if (frag.ok) {
      applyFormatted(code.slice(0, selection.from) + frag.code + code.slice(selection.to), 'Selection formatted');
      return;
    }
    // Fragments that don't parse alone (partial statements) fall back to
    // whole-document formatting, which is what VS Code effectively does.
    const whole = await formatDocument(code, language);
    if (whole.ok) applyFormatted(whole.code, 'Formatted whole file instead');
    else flash('error', frag.error);
  }, [code, language, applyFormatted, flash]);

  const askAgentToFix = React.useCallback((selection) => {
    const text = selection?.text || '';
    if (!text || !onSpawn) return;
    onSpawn('chat', {
      agentId: agentId || 'censai',
      msgs: [{ from: 'me', text: buildFixPrompt({ fileLabel, language, selectionText: text }) }],
      autoSend: true,
    });
  }, [fileLabel, language, onSpawn, agentId]);

  return { canFormat, formatStatus, formatWhole, formatRange, askAgentToFix };
}
