// Layout primitives — grid, sizing, and snapping constants.
// Pure data; imported across the layout modules. (Split from layoutAlgo.js.)
import { MIN_WINDOW_SIZE } from '../windowSizeClasses.js';

export const BASE_UNIT = 16;
// Seam between tiles in a group, in canvas px. The look can change it
// (theme `groupGap`, see ./gap.js); this is the default.
export const GUTTER = 2;
export const MIN_CELL_WIDTH = MIN_WINDOW_SIZE.w;
export const MIN_CELL_HEIGHT = MIN_WINDOW_SIZE.h;
export const DEFAULT_WINDOW_SIZE = { w: 1200, h: 800 };
export const SNAP_TOLERANCE = 12;
// Groups have no frame: the group rect is the tiles' outer edge.
export const GROUP_PADDING = 0;
// The group label floats above the tiles, so it takes no room inside.
export const GROUP_HEADER = 0;
// Tab strip above a slot that holds more than one window.
export const TAB_STRIP_HEIGHT = 28;

export const ALLOWED_RATIOS = [0.5, 0.382, 0.618, 0.333, 0.667, 0.25, 0.75];
