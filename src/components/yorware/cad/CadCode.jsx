/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { CAD_RECIPES } from '../../../lib/yorware/cadRecipes.js';

/** The recipe: the code that makes the part, with line numbers. */
export function CadCode({ cad }) {
  const { code, dirty, canEdit } = cad;
  const gutterRef = React.useRef(null);
  const lines = code.split('\n').length;

  const onKeyDown = (e) => {
    e.stopPropagation();
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); cad.runDraft(); return; }
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: a, selectionEnd: b } = el;
      const next = `${code.slice(0, a)}  ${code.slice(b)}`;
      cad.setDraft(next);
      requestAnimationFrame(() => { el.selectionStart = a + 2; el.selectionEnd = a + 2; });
    }
  };

  return (
    <section className="hb-yc-code" aria-label="Recipe">
      <div className="hb-yc-code-head">
        <span className="hb-cr-section-head">Recipe</span>
        <span className="hb-cr-row">
          {dirty && <button type="button" className="hb-of-btn" onClick={cad.discardDraft}>Discard</button>}
          <button type="button" className="hb-of-btn" data-wide="true" data-primary={dirty ? 'true' : undefined}
            disabled={!dirty || !canEdit} onClick={cad.runDraft} title="Save the recipe to the board and build it (Ctrl+Enter)">Run</button>
        </span>
      </div>
      <div className="hb-yc-editor">
        <pre className="hb-yc-gutter" ref={gutterRef} aria-hidden="true">{Array.from({ length: lines }, (_, i) => i + 1).join('\n')}</pre>
        <textarea className="hb-yc-textarea" value={code} spellCheck={false} readOnly={!canEdit} aria-label="Recipe code"
          onChange={(e) => cad.setDraft(e.target.value)} onKeyDown={onKeyDown}
          onScroll={(e) => { if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop; }} />
      </div>
      <p className="hb-cr-hint">
        JavaScript on <a href="https://replicad.xyz/docs" target="_blank" rel="noreferrer">replicad</a>: a <code>params</code> list
        becomes the dials, <code>main(r, p)</code> returns the part. Ctrl+Enter runs it for everyone on the board.
      </p>
      {canEdit && (
        <label className="hb-yc-replace">
          <span className="hb-cr-hint">Start again from</span>
          <select className="hb-of-select" value="" onChange={(e) => { if (e.target.value) cad.startFrom(e.target.value); }}>
            <option value="">a ready-made part…</option>
            {CAD_RECIPES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
      )}
    </section>
  );
}

/** The empty window: pick a part to start from. */
export function CadStart({ cad }) {
  return (
    <div className="hb-yc-start">
      <div className="hb-yl-start-title">Start a part</div>
      <p className="hb-cr-hint">Parts are short recipes with sizes you can dial in. Pick one to change, or start from a plain block and write your own. Everyone on the board sees the same part, and Export makes STL and STEP files.</p>
      <ul className="hb-yc-starters">
        {CAD_RECIPES.map((r) => (
          <li key={r.id}>
            <button type="button" className="hb-yc-starter" disabled={!cad.canEdit} onClick={() => cad.startFrom(r.id)}>
              <span className="hb-yc-starter-name">{r.label}</span>
              <span className="hb-yl-template-hint">{r.hint}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
