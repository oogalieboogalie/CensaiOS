// Legacy plain-textarea overlay pane for the code editor. Rendered when the
// VS Code-like (CodeMirror) pane can't run — jsdom tests, forced fallback.
// Extracted from CodeEditorWindow.jsx so that file stays within its budget.

import React from 'react';
import { highlightCode } from '../../lib/codeHighlighter.js';

const lineCount = (value) => Math.max(1, String(value || '').split('\n').length);

export function LegacyCodePane({ code, theme, winOpacity, readOnly, onChange, focusProps }) {
  const preRef = React.useRef(null);
  const lineNumbersRef = React.useRef(null);
  const lines = React.useMemo(() => Array.from({ length: lineCount(code) }, (_, i) => i + 1), [code]);

  const handleScroll = (e) => {
    if (preRef.current) {
      preRef.current.scrollTop = e.target.scrollTop;
      preRef.current.scrollLeft = e.target.scrollLeft;
    }
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = e.target.scrollTop;
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(48px, auto) minmax(0, 1fr)', background: winOpacity !== undefined ? 'transparent' : theme.background, color: theme.foreground, fontFamily: 'var(--font-mono)', fontSize: theme.fontSize || 13 }}>
      <div ref={lineNumbersRef} aria-hidden="true" style={{ padding: '12px 8px', textAlign: 'right', color: theme.selectionBackground, background: winOpacity !== undefined ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.2)', borderRight: `1px solid ${theme.black}`, overflow: 'hidden', lineHeight: 1.55, userSelect: 'none' }}>
        {lines.map((n) => <div key={n}>{n}</div>)}
      </div>
      <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0 }}>
        <pre ref={preRef} aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, margin: 0, padding: 12, border: 0, background: 'transparent', fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 1.55, tabSize: 2, whiteSpace: 'pre', overflow: 'hidden', pointerEvents: 'none', color: theme.foreground, zIndex: 1 }}
          dangerouslySetInnerHTML={{ __html: highlightCode(code, theme) + (code.endsWith('\n') ? ' ' : '') }}
        />
        <textarea value={code} onChange={(e) => onChange(e.target.value)} readOnly={readOnly} {...focusProps} onScroll={handleScroll} spellCheck={false} autoCapitalize="off" autoCorrect="off"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', resize: 'none', border: 0, outline: 'none', padding: 12, background: 'transparent', color: 'transparent', caretColor: theme.cursor || theme.foreground || 'var(--ink)', fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 1.55, tabSize: 2, whiteSpace: 'pre', overflow: 'auto', zIndex: 2 }}
        />
      </div>
    </div>
  );
}
