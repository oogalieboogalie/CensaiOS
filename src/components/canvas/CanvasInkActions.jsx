import React from 'react';
import { SketchActionBar } from '../ink/SketchActionBar.jsx';
import { strokeBounds } from '../../lib/ink/stroke.js';
import { cleanUpStroke } from '../../lib/ink/shapes.js';
import { sceneToPng } from '../../lib/ink/rasterize.js';
import { makeReal, sendToSketchpad } from '../../lib/ink/sketchActions.js';

// Spec 9: the action bar over selected canvas ink, plus a quiet outline of
// the selection. Lives in the canvas overlay, so it is drawn in canvas
// coordinates and counter-scaled to stay a constant size on screen.
export function CanvasInkActions({ selection = [], paths = [], setPaths, setSelection, zoom = 1 }) {
  const ids = React.useMemo(() => new Set(selection), [selection]);
  const strokes = React.useMemo(() => paths.filter((p) => ids.has(p.id)), [paths, ids]);
  const bounds = React.useMemo(() => strokeBounds(strokes), [strokes]);
  if (!strokes.length || !bounds) return null;
  const s = 1 / (zoom || 1);

  const getImage = async () => sceneToPng({ strokes });
  const cleanUp = () => {
    let changed = 0;
    setPaths((prev) => prev.map((p) => {
      if (!ids.has(p.id)) return p;
      const clean = cleanUpStroke(p);
      if (clean) changed += 1;
      return clean || p;
    }));
    return changed > 0;
  };

  return (
    <>
      <div
        data-ink-selection
        style={{
          position: 'absolute', left: bounds.x - 6 * s, top: bounds.y - 6 * s, width: bounds.w + 12 * s, height: bounds.h + 12 * s,
          border: `${s}px dashed var(--accent)`, borderRadius: 'var(--radius-sm)', pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'absolute', left: bounds.x, top: bounds.y - 10 * s, transform: `scale(${s}) translateY(-100%)`, transformOrigin: '0 0', zIndex: 210 }}>
        <SketchActionBar
          label={`${strokes.length} stroke${strokes.length === 1 ? '' : 's'}`}
          getImage={getImage}
          onMakeReal={() => { makeReal({ pathIds: strokes.map((p) => p.id) }, bounds); setSelection([]); }}
          onCleanUp={cleanUp}
          onSendToSketchpad={() => { sendToSketchpad(strokes); setSelection([]); }}
          onDelete={() => { setPaths((prev) => prev.filter((p) => !ids.has(p.id))); setSelection([]); }}
        />
      </div>
    </>
  );
}
