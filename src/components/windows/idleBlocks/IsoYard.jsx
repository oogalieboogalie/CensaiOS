/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { cubeFaces, plotPoints, sceneBox, sceneCubes, tilePoints, unturn } from '../../../lib/games/blocks/iso.js';
import { cellKey, plotOrigin, tallest, sameYard } from '../../../lib/games/blocks/yard.js';

const DRAG_STEP = 70;

/** Turning the yard: buttons, the arrow keys, or a sideways drag. */
function useTurn() {
  const [turn, setTurn] = React.useState(0);
  const [spin, setSpin] = React.useState(null);
  const drag = React.useRef(null);
  const step = (dir) => { setTurn((t) => (t + dir + 4) % 4); setSpin(dir > 0 ? 'right' : 'left'); };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); step(e.key === 'ArrowRight' ? 1 : -1); }
  };
  const onPointerDown = (e) => { drag.current = { x: e.clientX, moved: false }; };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || !(e.buttons & 1)) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) < DRAG_STEP) return;
    step(dx > 0 ? 1 : -1);
    drag.current = { x: e.clientX, moved: true };
  };
  // A drag that turned the yard should not also drop a block where it ended.
  const onClickCapture = (e) => {
    if (drag.current?.moved) { e.stopPropagation(); e.preventDefault(); }
    drag.current = null;
  };
  return { turn, spin, step, svgProps: { onKeyDown, onPointerDown, onPointerMove, onClickCapture } };
}

/**
 * The isometric view: the same plot drawn as a little world of cubes. Click
 * a top or an empty tile to build there, right-click to take your block back,
 * and turn it a side at a time to see a build from every angle.
 */
function IsoYardView({ size, stacks, canPlay, onPlace, onTake }) {
  const origin = plotOrigin(size);
  const { turn, spin, step, svgProps } = useTurn();
  const cubes = React.useMemo(() => sceneCubes(stacks, size, origin, turn), [stacks, size, origin, turn]);
  const handlers = (x, y) => (canPlay ? {
    onClick: (e) => (e.shiftKey ? onTake(x, y) : onPlace(x, y)),
    onContextMenu: (e) => { e.preventDefault(); onTake(x, y); },
  } : {});
  const ground = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [ux, uy] = unturn(x, y, size, turn);
      const gx = ux + origin;
      const gy = uy + origin;
      if (stacks[cellKey(gx, gy)]) continue;
      ground.push(<polygon key={cellKey(gx, gy)} points={tilePoints(x, y)} className="hb-blocks-ground"
        data-testid={`blocks-tile-${gx}-${gy}`} {...handlers(gx, gy)} />);
    }
  }
  return (
    <div className="hb-blocks-iso-wrap">
      <svg className="hb-blocks-iso" viewBox={sceneBox(size, tallest(stacks))} preserveAspectRatio="xMidYMid meet" tabIndex={0}
        data-testid="blocks-iso" data-no-drag data-playable={canPlay ? 'true' : undefined} data-turn={turn} {...svgProps}
        aria-label={`Your yard in 3D, ${cubes.length} blocks showing. Left and right arrows turn it.`}>
        <g key={turn} className="hb-blocks-scene" data-spin={spin || undefined}>
          <polygon points={plotPoints(size)} className="hb-blocks-plot" />
          {ground}
          {cubes.map((c) => {
            const f = cubeFaces(c.x, c.y, c.z);
            return (
              <g key={`${c.gx}-${c.gy}-${c.z}`} className="hb-blocks-cube" data-block={c.id}>
                {c.faces.left && <polygon points={f.left} className="hb-blocks-face" data-face="left" />}
                {c.faces.right && <polygon points={f.right} className="hb-blocks-face" data-face="right" />}
                {c.top && <polygon points={f.top} className="hb-blocks-face" data-face="top"
                  data-testid={`blocks-top-${c.gx}-${c.gy}`} {...handlers(c.gx, c.gy)} />}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="hb-blocks-turn" role="group" aria-label="Turn the yard">
        <button type="button" onClick={() => step(-1)} data-testid="blocks-turn-left" title="Turn left (left arrow)">⟲</button>
        <button type="button" onClick={() => step(1)} data-testid="blocks-turn-right" title="Turn right (right arrow)">⟳</button>
      </div>
    </div>
  );
}

export const IsoYard = React.memo(IsoYardView, sameYard);
