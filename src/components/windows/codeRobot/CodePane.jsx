/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { createTheme } from '@uiw/codemirror-themes';
import { tags as t } from '@lezer/highlight';

// Colors come from the board's tokens, so the editor follows every look.
const theme = createTheme({
  theme: 'light',
  settings: {
    background: 'var(--surface)',
    foreground: 'var(--ink)',
    caret: 'var(--accent)',
    selection: 'var(--accent-soft)',
    selectionMatch: 'var(--accent-soft)',
    lineHighlight: 'transparent',
    gutterBackground: 'var(--surface)',
    gutterForeground: 'var(--ink-faint)',
    gutterBorder: 'transparent',
  },
  styles: [
    { tag: [t.keyword, t.controlKeyword, t.definitionKeyword], color: 'var(--accent-text)' },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--ink)', fontWeight: '600' },
    { tag: [t.number, t.bool], color: 'var(--warning)' },
    { tag: [t.comment, t.lineComment], color: 'var(--ink-faint)', fontStyle: 'italic' },
    { tag: [t.string], color: 'var(--success)' },
    { tag: [t.operator, t.punctuation, t.bracket], color: 'var(--ink-soft)' },
  ],
});
const extensions = [javascript()];

/** The player's program. Uncontrolled after mount; a level change remounts it. */
export function CodePane({ code, onChange, onRun, readOnly }) {
  const runRef = React.useRef(onRun);
  runRef.current = onRun;
  return (
    <div className="hb-robot-code" data-testid="robot-code"
      onKeyDown={(e) => {
        // Ctrl or Cmd + Enter runs, like most code playgrounds.
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runRef.current?.(); }
      }}>
      <CodeMirror
        value={code}
        height="100%"
        theme={theme}
        extensions={extensions}
        readOnly={Boolean(readOnly)}
        basicSetup={{ autocompletion: false, bracketMatching: true, closeBrackets: true, foldGutter: false, highlightActiveLine: false }}
        onChange={(value) => onChange?.(value)}
      />
    </div>
  );
}
