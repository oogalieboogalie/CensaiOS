// BSP layout inference + clean (snap a layout tree into a rect). (Split from layoutAlgo.js.)
import { MIN_CELL_WIDTH, MIN_CELL_HEIGHT, SNAP_TOLERANCE, TAB_STRIP_HEIGHT } from './constants.js';
import { getGroupGap } from './gap.js';
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

/**
 * Solve a layout tree into a rect. Returns every window's rect plus the
 * geometry the canvas draws on top: one entry per split (for the draggable
 * seam) and one per slot (for tab strips). `path` addresses a node from the
 * root with 'f' (first) / 's' (second) steps.
 */
export function solveLayout(node, rect, { snapBounds = true, gap = getGroupGap() } = {}) {
  const out = { rects: [], splits: [], slots: [] };
  if (!node) return out;
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
  // A tree can need more room than the rect (say, three stacked tiles in a
  // short group); grow the rect instead of letting tiles spill past it.
  const min = getMinLayoutSize(node, gap);
  bounds.w = Math.max(bounds.w, min.w);
  bounds.h = Math.max(bounds.h, min.h);
  solveNode(node, bounds, gap, '', out);
  return out;
}

function solveNode(node, bounds, gap, path, out) {
  if (!node) return;
  if (node.type === 'leaf') {
    const stack = Array.isArray(node.stack) && node.stack.length > 1 ? node.stack : null;
    if (!stack) {
      if (node.windowId) out.rects.push({ id: node.windowId, rect: bounds });
      out.slots.push({ path, rect: bounds, stack: node.windowId ? [node.windowId] : [], activeId: node.windowId || null });
      return;
    }
    const body = { x: bounds.x, y: bounds.y + TAB_STRIP_HEIGHT, w: bounds.w, h: Math.max(1, bounds.h - TAB_STRIP_HEIGHT) };
    // Hidden tabs keep the same rect so they travel with the group.
    for (const id of stack) out.rects.push({ id, rect: body });
    out.slots.push({ path, rect: bounds, stack, activeId: stack.includes(node.windowId) ? node.windowId : stack[0] });
    return;
  }
  if (node.type !== 'split') return;
  const firstMin = getMinLayoutSize(node.first, gap);
  const secondMin = getMinLayoutSize(node.second, gap);
  const vertical = node.axis === 'vertical';
  const size = vertical ? bounds.w : bounds.h;
  const minFirst = vertical ? firstMin.w : firstMin.h;
  const minSecond = vertical ? secondMin.w : secondMin.h;
  const available = Math.max(minFirst + minSecond, size - gap);
  const firstSize = Math.max(minFirst, Math.min(available - minSecond, snapToGrid(available * node.ratio, 'round')));
  const secondSize = available - firstSize;
  const firstRect = vertical
    ? { x: bounds.x, y: bounds.y, w: firstSize, h: bounds.h }
    : { x: bounds.x, y: bounds.y, w: bounds.w, h: firstSize };
  const secondRect = vertical
    ? { x: bounds.x + firstSize + gap, y: bounds.y, w: secondSize, h: bounds.h }
    : { x: bounds.x, y: bounds.y + firstSize + gap, w: bounds.w, h: secondSize };
  out.splits.push({
    path,
    axis: node.axis,
    rect: bounds,
    available,
    minFirst,
    minSecond,
    firstSize,
    seam: vertical
      ? { x: bounds.x + firstSize, y: bounds.y, w: gap, h: bounds.h }
      : { x: bounds.x, y: bounds.y + firstSize, w: bounds.w, h: gap },
  });
  solveNode(node.first, firstRect, gap, path + 'f', out);
  solveNode(node.second, secondRect, gap, path + 's', out);
}

export function cleanLayout(node, rect, updates = [], snapBounds = true) {
  if (!node) return updates;
  for (const { id, rect: r } of solveLayout(node, rect, { snapBounds }).rects) {
    updates.push({ id, patch: { ...r } });
  }
  return updates;
}
