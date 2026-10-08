import React from 'react';
import { SketchActionBar } from '../ink/SketchActionBar.jsx';
import { recognizeShape } from '../../lib/ink/shapes.js';
import { sceneToPng } from '../../lib/ink/rasterize.js';
import { makeReal } from '../../lib/ink/sketchActions.js';

/** Pencil marks that read as shapes become real Sketchpad shapes. */
export function cleanUpElements(elements) {
  let changed = 0;
  const next = elements.map((el) => {
    if (el.type !== 'pencil') return el;
    const shape = recognizeShape(el.pts);
    if (!shape) return el;
    changed += 1;
    const base = { id: el.id, color: el.color, strokeWidth: el.strokeWidth };
    if (shape.kind === 'rect') return { ...base, type: 'rect', ...shape.bounds };
    if (shape.kind === 'ellipse') return { ...base, type: 'circle', ...shape.bounds };
    const pts = [shape.from, shape.to].map((p) => ({ x: p.x, y: p.y, p: 0.5 }));
    return { ...el, pts, pen: true, x: pts[0].x, y: pts[0].y };
  });
  return { elements: next, changed };
}

// Same bar as canvas ink (spec 9), for the whole drawing.
export function SketchpadActions({ win, elements, onChange }) {
  const cleanUp = () => {
    const result = cleanUpElements(elements);
    if (result.changed) onChange(result.elements);
    return result.changed > 0;
  };
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 'var(--space-3)', display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 10 }}>
      <div style={{ pointerEvents: 'auto' }}>
        <SketchActionBar
          menuAbove
          getImage={() => sceneToPng({ elements })}
          onMakeReal={() => makeReal({ windowId: win.id }, { x: win.x, y: win.y, w: win.w, h: win.h })}
          onCleanUp={cleanUp}
        />
      </div>
    </div>
  );
}

