/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { cubeFaces, plotPoints, sceneBox, sceneCubes, tilePoints } from '../../../lib/games/blocks/iso.js';
import { cellKey, tallest } from '../../../lib/games/blocks/yard.js';

/**
 * The isometric view: the same plot drawn as a little world of cubes. Click
 * a top or an empty tile to build there, right-click to take your block back.
 */
export function IsoYard({ size, stacks, canPlay, onPlace, onTake }) {
  const cubes = React.useMemo(() => sceneCubes(stacks, size), [stacks, size]);
  const handlers = (x, y) => (canPlay ? {
    onClick: (e) => (e.shiftKey ? onTake(x, y) : onPlace(x, y)),
    onContextMenu: (e) => { e.preventDefault(); onTake(x, y); },
  } : {});
  const ground = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (stacks[cellKey(x, y)]) continue;
      ground.push(<polygon key={cellKey(x, y)} points={tilePoints(x, y)} className="hb-blocks-ground"
        data-testid={`blocks-tile-${x}-${y}`} {...handlers(x, y)} />);
    }
  }
  return (
    <svg className="hb-blocks-iso" viewBox={sceneBox(size, tallest(stacks))} preserveAspectRatio="xMidYMid meet"
      data-testid="blocks-iso" data-no-drag data-playable={canPlay ? 'true' : undefined} aria-label={`Your yard in 3D, ${cubes.length} blocks showing`}>
      <polygon points={plotPoints(size)} className="hb-blocks-plot" />
      {ground}
      {cubes.map((c) => {
        const f = cubeFaces(c.x, c.y, c.z);
        return (
          <g key={`${c.x}-${c.y}-${c.z}`} className="hb-blocks-cube" data-block={c.id}>
            <polygon points={f.left} className="hb-blocks-face" data-face="left" />
            <polygon points={f.right} className="hb-blocks-face" data-face="right" />
            <polygon points={f.top} className="hb-blocks-face" data-face="top"
              data-testid={c.top ? `blocks-top-${c.x}-${c.y}` : undefined} {...(c.top ? handlers(c.x, c.y) : {})} />
          </g>
        );
      })}
    </svg>
  );
}
