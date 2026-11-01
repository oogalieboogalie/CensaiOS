/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { BLOCK_BY_ID } from '../../../lib/games/blocks/economy.js';
import { cellKey, plotOrigin, sameYard } from '../../../lib/games/blocks/yard.js';

function cellTitle(stack, canPlay) {
  const how = canPlay ? 'Click to add a block, right-click to take one of yours back.' : '';
  if (!stack?.length) return `Empty. ${how}`.trim();
  const names = stack.map((b) => BLOCK_BY_ID.get(b.id)?.name.toLowerCase()).join(', ');
  return `${stack.length} stacked: ${names}. ${how}`.trim();
}

/**
 * The flat view: the plot seen from above, one square per spot, each showing
 * how many blocks are stacked there and the colour of the top one.
 */
function FlatYardView({ size, stacks, field, canPlay, onPlace, onTake }) {
  const cells = [];
  const lo = plotOrigin(size);
  for (let y = lo; y < lo + size; y += 1) {
    for (let x = lo; x < lo + size; x += 1) {
      const stack = stacks[cellKey(x, y)];
      const top = stack?.[stack.length - 1];
      cells.push(
        <button key={cellKey(x, y)} type="button" className="hb-blocks-cell" data-block={top?.id}
          data-mine={stack?.some((b) => b.field === field) ? 'true' : undefined}
          style={{ '--stack': stack?.length || 0 }} disabled={!canPlay} title={cellTitle(stack, canPlay)}
          data-testid={`blocks-cell-${x}-${y}`} data-no-drag
          onClick={(e) => (e.shiftKey ? onTake(x, y) : onPlace(x, y))}
          onContextMenu={(e) => { e.preventDefault(); onTake(x, y); }}>
          {stack?.length ? <span className="hb-blocks-count hb-game-num">{stack.length}</span> : null}
        </button>,
      );
    }
  }
  return (
    <div className="hb-blocks-flat" style={{ '--size': size }} data-big={size > 24 ? 'true' : undefined} data-testid="blocks-flat" aria-label={`Your yard, ${size} by ${size}`}>
      {cells}
    </div>
  );
}

export const FlatYard = React.memo(FlatYardView, sameYard);
