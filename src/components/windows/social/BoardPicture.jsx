/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

const PAD = 40;

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Window boxes cleaned up (remote boards come from another computer). */
export function cleanBoxes(windows = []) {
  return (Array.isArray(windows) ? windows : []).slice(0, 40).map((win, index) => ({
    key: index,
    x: num(win?.x, 0), y: num(win?.y, 0),
    w: Math.max(40, num(win?.w, 320)), h: Math.max(30, num(win?.h, 240)),
    title: String(win?.title || win?.kind || 'Window').slice(0, 40),
  }));
}

export function pictureFrame(boxes) {
  if (!boxes.length) return null;
  const minX = Math.min(...boxes.map((b) => b.x)) - PAD;
  const minY = Math.min(...boxes.map((b) => b.y)) - PAD;
  const maxX = Math.max(...boxes.map((b) => b.x + b.w)) + PAD;
  const maxY = Math.max(...boxes.map((b) => b.y + b.h)) + PAD;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** A small picture of a board: one box per window, titled when there is room. */
export function BoardPicture({ windows, label }) {
  const boxes = cleanBoxes(windows);
  const frame = pictureFrame(boxes);
  if (!frame) return <div className="hb-social-pic" data-empty="true"><span>Nothing on this board yet</span></div>;
  const unit = frame.w / 360;
  return (
    <div className="hb-social-pic" role="img" aria-label={label || `Board with ${boxes.length} windows`}>
      <svg viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`} preserveAspectRatio="xMidYMid meet">
        {boxes.map((box) => (
          <g key={box.key}>
            <rect className="hb-social-pic-win" x={box.x} y={box.y} width={box.w} height={box.h} rx={unit * 5} strokeWidth={unit} />
            <rect className="hb-social-pic-bar" x={box.x} y={box.y} width={box.w} height={Math.min(box.h, unit * 16)} rx={unit * 5} />
            {box.w > unit * 60 && (
              <text className="hb-social-pic-title" x={box.x + unit * 7} y={box.y + unit * 11.5} fontSize={unit * 9}>
                {box.title.length > Math.floor(box.w / (unit * 5.5)) ? `${box.title.slice(0, Math.floor(box.w / (unit * 5.5)) - 1)}…` : box.title}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
