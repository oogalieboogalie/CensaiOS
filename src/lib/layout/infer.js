// BSP layout inference + clean (snap a layout tree into a rect). (Split from layoutAlgo.js.)
import { GUTTER, MIN_CELL_WIDTH, MIN_CELL_HEIGHT, SNAP_TOLERANCE } from './constants.js';
import { snapToGrid, snapRatio } from './grid.js';
import { getMinLayoutSize } from './bounds.js';

function variance(arr) {
  if (arr.length <= 1) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
}

function partitionForAxis(windows, axis) {
  const coord = axis === 'vertical' ? 'x' : 'y';
  const size = axis === 'vertical' ? 'w' : 'h';
  const center = axis === 'vertical' ? 'cx' : 'cy';
  const items = windows
    .map(w => ({ w, cx: w.x + w.w / 2, cy: w.y + w.h / 2 }))
    .sort((a, b) => a[center] - b[center]);

  const minStart = Math.min(...items.map(item => item.w[coord]));
  const maxEnd = Math.max(...items.map(item => item.w[coord] + item.w[size]));
  const totalSize = Math.max(1, maxEnd - minStart);

  let best = null;
  for (let i = 1; i < items.length; i++) {
    const first = items.slice(0, i);
    const second = items.slice(i);
    const firstEnd = Math.max(...first.map(item => item.w[coord] + item.w[size]));
    const secondStart = Math.min(...second.map(item => item.w[coord]));
    const clearGap = secondStart - firstEnd;
    const centerGap = second[0][center] - first[first.length - 1][center];
    const score = clearGap > 0 ? clearGap : centerGap * 0.18;
    const splitCoord = clearGap > 0
      ? firstEnd + clearGap / 2
      : (first[first.length - 1][center] + second[0][center]) / 2;

    if (!best || score > best.score) {
      best = {
        score,
        centerGap,
        splitCoord,
        ratio: snapRatio(Math.max(0.1, Math.min(0.9, (splitCoord - minStart) / totalSize)), totalSize),
        firstSet: first.map(item => item.w),
        secondSet: second.map(item => item.w),
      };
    }
  }
  return best;
}

export function inferLayout(windows) {
  if (!windows || windows.length === 0) return null;
  if (windows.length === 1) return { type: 'leaf', windowId: windows[0].id };

  const centers = windows.map(w => ({ cx: w.x + w.w / 2, cy: w.y + w.h / 2 }));

  const xVar = variance(centers.map(c => c.cx));
  const yVar = variance(centers.map(c => c.cy));
  const vertical = partitionForAxis(windows, 'vertical');
  const horizontal = partitionForAxis(windows, 'horizontal');
  const varianceAxis = xVar >= yVar ? 'vertical' : 'horizontal';
  const gapAxis = (vertical?.score ?? -Infinity) >= (horizontal?.score ?? -Infinity) ? 'vertical' : 'horizontal';
  const axis = Math.abs((vertical?.score ?? 0) - (horizontal?.score ?? 0)) <= SNAP_TOLERANCE
    ? varianceAxis
    : gapAxis;
  const partition = axis === 'vertical' ? vertical : horizontal;

  return {
    type: 'split',
    axis,
    ratio: partition?.ratio ?? 0.5,
    first: inferLayout(partition?.firstSet || windows.slice(0, 1)),
    second: inferLayout(partition?.secondSet || windows.slice(1))
  };
}

export function cleanLayout(node, rect, updates = [], snapBounds = true) {
  if (!node) return updates;

  const bounds = snapBounds
    ? {
        x: snapToGrid(rect.x, 'round'),
        y: snapToGrid(rect.y, 'round'),
        w: Math.max(MIN_CELL_WIDTH, snapToGrid(rect.w, 'round')),
        h: Math.max(MIN_CELL_HEIGHT, snapToGrid(rect.h, 'round')),
      }
    : {
        x: rect.x,
        y: rect.y,
        w: Math.max(MIN_CELL_WIDTH, rect.w),
        h: Math.max(MIN_CELL_HEIGHT, rect.h),
      };

  if (node.type === 'leaf') {
    updates.push({ id: node.windowId, patch: bounds });
  } else if (node.type === 'split') {
    const firstMin = getMinLayoutSize(node.first);
    const secondMin = getMinLayoutSize(node.second);
    if (node.axis === 'vertical') {
      const available = Math.max(firstMin.w + secondMin.w, bounds.w - GUTTER);
      const rawFirstW = available * node.ratio;
      const firstW = Math.max(firstMin.w, Math.min(available - secondMin.w, snapToGrid(rawFirstW, 'round')));
      const secondW = available - firstW;

      cleanLayout(node.first, { x: bounds.x, y: bounds.y, w: firstW, h: bounds.h }, updates, false);
      cleanLayout(node.second, { x: bounds.x + firstW + GUTTER, y: bounds.y, w: secondW, h: bounds.h }, updates, false);
    } else {
      const available = Math.max(firstMin.h + secondMin.h, bounds.h - GUTTER);
      const rawFirstH = available * node.ratio;
      const firstH = Math.max(firstMin.h, Math.min(available - secondMin.h, snapToGrid(rawFirstH, 'round')));
      const secondH = available - firstH;

      cleanLayout(node.first, { x: bounds.x, y: bounds.y, w: bounds.w, h: firstH }, updates, false);
      cleanLayout(node.second, { x: bounds.x, y: bounds.y + firstH + GUTTER, w: bounds.w, h: secondH }, updates, false);
    }
  }
  return updates;
}
