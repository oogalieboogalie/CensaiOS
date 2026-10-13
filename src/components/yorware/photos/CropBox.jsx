/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

export const ASPECTS = Object.freeze([
  ['free', 'Free'], ['original', 'Original'], ['1', 'Square'], ['0.8', '4:5'], ['1.5', '3:2'], ['1.7778', '16:9'],
]);
const FULL = { x: 0, y: 0, w: 1, h: 1 };
const MIN = 0.05;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** The biggest centred box of a pixel shape `ratio` in a tw × th picture, in 0..1. */
export function fitAspect(ratio, tw, th) {
  if (!ratio) return FULL;
  const w = Math.min(1, (ratio * th) / tw);
  const h = Math.min(1, (w * tw) / (ratio * th));
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/**
 * The crop box over the whole (uncropped) picture: drag inside to move it,
 * drag a corner to resize. A fixed shape keeps its shape. Lets go = one change.
 */
export function CropBox({ crop, ratio, tw, th, onCommit }) {
  const [box, setBox] = React.useState(crop || FULL);
  const drag = React.useRef(null);
  React.useEffect(() => { if (!drag.current) setBox(crop || FULL); }, [crop]);

  const start = (e, mode) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.closest('.hb-yph-cropwrap').getBoundingClientRect();
    drag.current = { mode, rect, from: box, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / d.rect.width;
    const dy = (e.clientY - d.y) / d.rect.height;
    const f = d.from;
    if (d.mode === 'move') {
      setBox({ ...f, x: clamp(f.x + dx, 0, 1 - f.w), y: clamp(f.y + dy, 0, 1 - f.h) });
      return;
    }
    const left = d.mode.includes('w');
    const top = d.mode.includes('n');
    const ax = left ? f.x + f.w : f.x;
    const ay = top ? f.y + f.h : f.y;
    let w = clamp(left ? f.w - dx : f.w + dx, MIN, left ? ax : 1 - ax);
    let h = clamp(top ? f.h - dy : f.h + dy, MIN, top ? ay : 1 - ay);
    if (ratio) {
      const hFromW = (w * tw) / (ratio * th);
      if (hFromW <= (top ? ay : 1 - ay)) h = hFromW; else w = (h * ratio * th) / tw;
    }
    setBox({ x: left ? ax - w : ax, y: top ? ay - h : ay, w, h });
  };
  const end = () => {
    if (!drag.current) return;
    drag.current = null;
    onCommit(box);
  };

  const style = { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` };
  return (
    <div className="hb-yph-crop" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <div className="hb-yph-crop-box" style={style} onPointerDown={(e) => start(e, 'move')}>
        <span className="hb-yph-crop-third" data-axis="v" />
        <span className="hb-yph-crop-third" data-axis="h" />
        {['nw', 'ne', 'sw', 'se'].map((c) => (
          <span key={c} className="hb-yph-crop-handle" data-corner={c} onPointerDown={(e) => start(e, c)} />
        ))}
      </div>
    </div>
  );
}
