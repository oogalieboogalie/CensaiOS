// Maps detected languages to CodeMirror language extensions.
// Static imports only (Vite-friendly, no dynamic-import chunk puzzles).

import { EditorView } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
import { markdown } from '@codemirror/lang-markdown';

export function extensionsForLanguage(language) {
  const wrapForProse = [EditorView.lineWrapping];
  switch (language) {
    case 'javascript':
      return [javascript({ jsx: false, typescript: false })];
    case 'jsx':
      return [javascript({ jsx: true, typescript: false })];
    case 'typescript':
      return [javascript({ jsx: false, typescript: true })];
    case 'tsx':
      return [javascript({ jsx: true, typescript: true })];
    case 'html':
      return [html(), ...wrapForProse];
    case 'css':
      return [css()];
    case 'json':
      return [json()];
    case 'python':
      return [python()];
    case 'markdown':
      return [markdown(), ...wrapForProse];
    default:
      return [];
  }
}
