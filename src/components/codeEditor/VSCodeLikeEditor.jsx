// VS Code-like editor pane (CodeMirror 6) for the code editor window.
// Language-aware highlighting, full-theme takeover, live selection tracking.
// The parent drives content via `code`; edits flow back through `onChange`.

import React from 'react';
import CodeMirror, { EditorView, ExternalChange } from '@uiw/react-codemirror';
import { diffText } from '../../../server/collab/textDiff.js';
import { extensionsForLanguage } from './editorExtensions.js';
import { buildEditorTheme } from './codeMirrorTheme.js';

function selectionFromState(state) {
  const main = state.selection.main;
  return {
    from: main.from,
    to: main.to,
    text: main.empty ? '' : state.sliceDoc(main.from, main.to),
  };
}

export const VSCodeLikeEditor = React.forwardRef(function VSCodeLikeEditor(
  { code, language, editorTheme, fontSize, readOnly, onChange, onSelection },
  ref,
) {
  const viewRef = React.useRef(null);
  const onSelectionRef = React.useRef(onSelection);
  onSelectionRef.current = onSelection;

  const themeExtension = React.useMemo(
    () => buildEditorTheme({ ...editorTheme, fontSize }),
    // Spread deps individually so memo only busts on real theme edits.
    [editorTheme?.background, editorTheme?.foreground, editorTheme?.cursor,
      editorTheme?.selectionBackground, editorTheme?.black, editorTheme?.blue,
      editorTheme?.cyan, editorTheme?.green, editorTheme?.magenta,
      editorTheme?.red, editorTheme?.white, editorTheme?.yellow, fontSize],
  );
  const languageExtensions = React.useMemo(() => extensionsForLanguage(language), [language]);
  const baseExtensions = React.useMemo(
    () => [EditorView.editable.of(!readOnly)],
    [readOnly],
  );

  // CodeMirror stays uncontrolled after mount: the wrapper's own value sync
  // defers updates while you type and later replays a stale copy, which
  // clobbers edits. Every outside change (someone else typing, a file load)
  // is applied here as just the changed span, so the cursor maps through it.
  const initialCode = React.useRef(code).current;
  React.useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view || typeof code !== 'string') return;
    const current = view.state.doc.toString();
    if (current === code) return;
    const op = diffText(current, code);
    view.dispatch({ changes: { from: op.index, to: op.index + op.remove, insert: op.insert }, annotations: [ExternalChange.of(true)] });
  }, [code]);

  const reportSelection = React.useCallback((state) => {
    onSelectionRef.current?.(selectionFromState(state));
  }, []);

  React.useImperativeHandle(ref, () => ({
    getSelection() {
      const view = viewRef.current;
      if (!view) return { from: 0, to: 0, text: '' };
      return selectionFromState(view.state);
    },
    focus() {
      viewRef.current?.focus();
    },
  }), []);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }} data-vscode-like-editor>
      <CodeMirror
        value={initialCode}
        height="100%"
        width="100%"
        theme={themeExtension}
        extensions={[...languageExtensions, ...baseExtensions]}
        readOnly={Boolean(readOnly)}
        indentWithTab={false}
        basicSetup={{ autocompletion: true, bracketMatching: true, closeBrackets: true }}
        onChange={(value, viewUpdate) => onChange?.(value, viewUpdate.startState.doc.toString())}
        onCreateEditor={(view) => { viewRef.current = view; }}
        onUpdate={(viewUpdate) => {
          if (viewUpdate.selectionSet) reportSelection(viewUpdate.state);
        }}
        onStatistics={(data) => {
          if (typeof data?.selectionCode === 'string' && data.selection) {
            onSelectionRef.current?.({
              from: data.selection.main?.from ?? 0,
              to: data.selection.main?.to ?? 0,
              text: data.selectionCode,
            });
          }
        }}
        style={{ flex: 1, minHeight: 0, fontSize: fontSize || 'var(--text-md)' }}
      />
    </div>
  );
});
