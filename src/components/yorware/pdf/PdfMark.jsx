/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { HIGHLIGHT_OPACITY, PDF_INK } from '../../../lib/yorware/pdfColors.js';
import { strokesToPath } from '../../../lib/yorware/pdfExport.js';

const LABEL = { text: 'Text', sign: 'Signature', highlight: 'Highlight', redact: 'Blacked out', signHere: 'Sign here' };

/**
 * One thing placed on a page, drawn the way the export will draw it. `box`
 * is the live position (it differs from the mark while it's being dragged).
 */
export function PdfMark({ id, mark, box, scale, selected, editing, onPointerDown, onDoubleClick, onText, onEndEdit, onSign }) {
  const style = { left: box.x * scale, top: box.y * scale, width: box.w * scale, height: box.h * scale };
  const common = {
    className: 'hb-yp-mark', 'data-mark': id, 'data-type': mark.type, 'data-selected': selected ? 'true' : undefined,
    'aria-label': mark.type === 'text' ? `Text: ${mark.text}` : LABEL[mark.type], style, onPointerDown, onDoubleClick,
  };
  let body = null;
  if (mark.type === 'text') {
    const font = { fontSize: (Number(mark.size) || 14) * scale, color: mark.color || PDF_INK.text, padding: `${2 * scale}px ${3 * scale}px` };
    body = editing
      ? <textarea className="hb-yp-text-edit" aria-label="Text on the page" style={font} value={mark.text} autoFocus
          onFocus={(e) => e.target.select()} onChange={(e) => onText(e.target.value)} onBlur={onEndEdit}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); e.currentTarget.blur(); } }} />
      : <div className="hb-yp-text" style={font}>{mark.text}</div>;
  } else if (mark.type === 'highlight') {
    body = <div className="hb-yp-fill" style={{ background: PDF_INK.highlight, opacity: HIGHLIGHT_OPACITY }} />;
  } else if (mark.type === 'redact') {
    body = <div className="hb-yp-fill" style={{ background: PDF_INK.redact }} />;
  } else if (mark.type === 'signHere') {
    // A request, not ink: it never prints. One click on Sign puts your signature here.
    common['aria-label'] = `Sign here${mark.signer ? ` (${mark.signer})` : ''}`;
    body = (
      <div className="hb-yp-flag" style={{ fontSize: Math.max(8, 11 * scale) }}>
        <span className="hb-yp-flag-text">
          <strong>Sign here</strong>
          {(mark.signer || mark.note) && <span className="hb-yp-flag-who">{[mark.signer, mark.note].filter(Boolean).join(' · ')}</span>}
        </span>
        <button type="button" className="hb-yp-flag-btn" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onSign?.(); }}>Sign</button>
      </div>
    );
  } else if (mark.type === 'sign') {
    body = (
      <svg className="hb-yp-sign" viewBox={`0 0 ${box.w} ${box.h}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={strokesToPath(mark.strokes, box.w, box.h)} fill="none" stroke={PDF_INK.sign}
          strokeWidth={Math.max(1, box.w / 160)} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <div {...common}>
      {body}
      {selected && !editing && <span className="hb-yp-handle" data-handle="resize" aria-hidden="true" />}
    </div>
  );
}
