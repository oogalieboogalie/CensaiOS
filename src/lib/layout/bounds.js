// Window/group bounds geometry. (Split from layoutAlgo.js.)
import {
  GUTTER, MIN_CELL_WIDTH, MIN_CELL_HEIGHT, GROUP_PADDING, GROUP_HEADER,
} from './constants.js';
import { snapToGrid } from './grid.js';

export function getWindowBounds(windows = []) {
  if (!windows.length) return null;
  const minX = Math.min(...windows.map(w => w.x));
  const minY = Math.min(...windows.map(w => w.y));
  const maxX = Math.max(...windows.map(w => w.x + w.w));
  const maxY = Math.max(...windows.map(w => w.y + w.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function makeGroupBoundsForWindows(windows = [], padding = GROUP_PADDING, header = GROUP_HEADER) {
  const bounds = getWindowBounds(windows);
  if (!bounds) return null;
  return {
    x: snapToGrid(bounds.x - padding, 'floor'),
    y: snapToGrid(bounds.y - padding - header, 'floor'),
    w: snapToGrid(bounds.w + padding * 2, 'ceil'),
    h: snapToGrid(bounds.h + padding * 2 + header, 'ceil'),
  };
}

export function getGroupInnerBounds(group, padding = GROUP_PADDING, header = GROUP_HEADER) {
  return {
    x: snapToGrid(group.x + padding, 'round'),
    y: snapToGrid(group.y + padding + header, 'round'),
    w: Math.max(MIN_CELL_WIDTH, snapToGrid(group.w - padding * 2, 'round')),
    h: Math.max(MIN_CELL_HEIGHT, snapToGrid(group.h - padding * 2 - header, 'round')),
  };
}

export function getMinLayoutSize(node) {
  if (!node || node.type === 'leaf') return { w: MIN_CELL_WIDTH, h: MIN_CELL_HEIGHT };
  const first = getMinLayoutSize(node.first);
  const second = getMinLayoutSize(node.second);
  if (node.axis === 'vertical') {
    return { w: first.w + GUTTER + second.w, h: Math.max(first.h, second.h) };
  }
  return { w: Math.max(first.w, second.w), h: first.h + GUTTER + second.h };
}

export function fitGroupToLayout(group, node, padding = GROUP_PADDING, header = GROUP_HEADER) {
  const min = getMinLayoutSize(node);
  return {
    ...group,
    x: snapToGrid(group.x, 'round'),
    y: snapToGrid(group.y, 'round'),
    w: Math.max(snapToGrid(group.w, 'round'), snapToGrid(min.w + padding * 2, 'ceil')),
    h: Math.max(snapToGrid(group.h, 'round'), snapToGrid(min.h + padding * 2 + header, 'ceil')),
  };
}

export const getOwningGroup = (item, allGroups, isGroup) => {
  const cx = item.x + item.w / 2;
  const cy = item.y + item.h / 2;
  const itemArea = item.w * item.h;

  let containing = allGroups.filter(grp => {
    if (isGroup) {
      const grpArea = grp.w * grp.h;
      if (itemArea >= grpArea * 0.9) return false;
      return item.x >= grp.x && item.y >= grp.y && (item.x + item.w) <= (grp.x + grp.w) && (item.y + item.h) <= (grp.y + grp.h);
    } else {
      return cx >= grp.x && cx <= grp.x + grp.w && cy >= grp.y && cy <= grp.y + grp.h;
    }
  });

  if (containing.length === 0) return null;
  containing.sort((a, b) => (a.w * a.h) - (b.w * b.h));
  return containing[0];
};
