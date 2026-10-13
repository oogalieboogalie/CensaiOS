/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { strokesToPath } from '../../../lib/yorware/pdfExport.js';
import { PDF_INK } from '../../../lib/yorware/pdfColors.js';

const PAD_W = 420;
const PAD_H = 160;

/**
 * Strokes in pad pixels -> strokes cropped to the ink, as 0..1 of that box,
 * plus the box's width/height ratio. Returns null when nothing was drawn.
 */
export function normalizeStrokes(strokes) {
  const pts = strokes.flat();
  if (pts.length < 4) return null;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]);
    minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1]);
  }
  const pad = 4;
  const w = Math.max(8, maxX - minX + pad * 2);
  const h = Math.max(8, maxY - minY + pad * 2);
  const round = (n) => Math.round(n * 1000) / 1000;
  return {
    ratio: w / h,
    strokes: strokes.map((s) => s.map((v, i) => round(i % 2 === 0 ? (v - minX + pad) / w : (v - minY + pad) / h))),
  };
}

/** Draw your signature once; it's kept in this browser for next time. */
export function SignaturePad({ onSave, onCancel }) {
  const [strokes, setStrokes] = React.useState([]);
  const drawing = React.useRef(false);
  const ref = React.useRef(null);

  const at = (e) => {
    const r = ref.current.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * PAD_W), Math.round(((e.clientY - r.top) / r.height) * PAD_H)];
  };
  const down = (e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); drawing.current = true; setStrokes((s) => [...s, at(e)]); };
  const move = (e) => {
    if (!drawing.current) return;
    const pt = at(e);
    setStrokes((s) => [...s.slice(0, -1), [...s[s.length - 1], ...pt]]);
  };
  const up = () => { drawing.current = false; };
  const raw = strokes.map((s) => s.map((v, i) => (i % 2 === 0 ? v / PAD_W : v / PAD_H)));

  return (
    <div className="hb-yp-modal" role="dialog" aria-modal="true" aria-label="Draw your signature"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }}>
      <div className="hb-yp-modal-card">
        <div className="hb-yp-modal-head">Draw your signature</div>
        <svg ref={ref} className="hb-yp-pad" viewBox={`0 0 ${PAD_W} ${PAD_H}`} data-testid="signature-pad"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <line x1="24" x2={PAD_W - 24} y1={PAD_H - 36} y2={PAD_H - 36} className="hb-yp-pad-line" />
          <path d={strokesToPath(raw, PAD_W, PAD_H)} fill="none" stroke={PDF_INK.sign} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="hb-cr-hint">It stays in this browser so you can sign again with one click. Teammates see it only where you place it.</p>
        <div className="hb-yp-modal-actions">
          <button type="button" className="hb-of-btn" data-wide="true" onClick={() => setStrokes([])} disabled={!strokes.length}><span>Clear</span></button>
          <span className="hb-cr-grow" />
          <button type="button" className="hb-of-btn" data-wide="true" onClick={onCancel}><span>Cancel</span></button>
          <button type="button" className="hb-of-btn" data-wide="true" data-primary="true" disabled={!strokes.some((s) => s.length >= 4)}
            onClick={() => { const sig = normalizeStrokes(strokes); if (sig) onSave(sig); }}><span>Use this signature</span></button>
        </div>
      </div>
    </div>
  );
}
