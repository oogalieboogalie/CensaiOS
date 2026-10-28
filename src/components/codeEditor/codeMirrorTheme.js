// Builds a CodeMirror theme extension from the window's editorTheme so the
// user's theme takes over the WHOLE editor (background, gutter, selection,
// caret, token colors) — the "themes don't fully take over" fix.

import { EditorView } from '@codemirror/view';
import { createTheme } from '@uiw/codemirror-themes';
import { tags as t } from '@lezer/highlight';
import { DEFAULT_THEME } from '../windows/WindowThemePanel.jsx';

function withAlpha(hex, alpha) {
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  return `${hex}${alpha}`;
}

// Gaps on the 4-point grid (docs/ui-yardstick.md): CodeMirror's own
// defaults use 3px and 5px around the line numbers.
const SPACING = EditorView.theme({
  '.cm-content': { padding: 'var(--space-2) 0' },
  '.cm-gutterElement': { padding: '0 var(--space-1) 0 var(--space-2)' },
  '.cm-foldGutter .cm-gutterElement': { padding: '0 var(--space-0-5)' },
});

export function buildEditorTheme(editorTheme = {}) {
  const theme = { ...DEFAULT_THEME, ...editorTheme };
  return [SPACING, createTheme({
    theme: theme.mode === 'light' ? 'light' : 'dark',
    settings: {
      background: theme.background,
      foreground: theme.foreground,
      caret: theme.cursor || theme.foreground,
      selection: withAlpha(theme.selectionBackground, '55'),
      selectionMatch: withAlpha(theme.selectionBackground, '33'),
      lineHighlight: withAlpha(theme.selectionBackground, '22'),
      // The gutter sits a step below the code, and its numbers stay
      // readable (about 64% of the text colour, 4.5:1 or better).
      gutterBackground: `color-mix(in oklab, ${theme.background} 96%, ${theme.foreground})`,
      gutterForeground: withAlpha(theme.foreground, 'A3'),
      gutterActiveForeground: theme.foreground,
      gutterBorder: withAlpha(theme.foreground, '22'),
      fontFamily: 'var(--font-mono)',
    },
    styles: [
      { tag: t.comment, color: withAlpha(theme.foreground, '99'), fontStyle: 'italic' },
      { tag: [t.string, t.special(t.brace)], color: theme.green },
      { tag: [t.number, t.bool, t.null], color: theme.yellow },
      { tag: [t.keyword, t.controlKeyword, t.operatorKeyword], color: theme.red, fontWeight: '600' },
      { tag: [t.typeName, t.className, t.definition(t.typeName)], color: theme.blue, fontWeight: '600' },
      { tag: [t.tagName, t.angleBracket], color: theme.red, fontWeight: '600' },
      { tag: [t.attributeName, t.propertyName], color: theme.cyan },
      { tag: [t.variableName, t.definition(t.variableName)], color: theme.foreground },
      { tag: [t.function(t.variableName), t.function(t.propertyName)], color: theme.cyan },
      { tag: [t.operator, t.punctuation, t.separator], color: withAlpha(theme.foreground, 'CC') },
      { tag: t.url, color: theme.magenta },
      { tag: t.invalid, color: theme.red, textDecoration: 'underline wavy' },
    ],
  })];
}
