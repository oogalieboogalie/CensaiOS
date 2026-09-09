// Layout primitives — grid, sizing, and snapping constants.
// Pure data; imported across the layout modules. (Split from layoutAlgo.js.)

export const BASE_UNIT = 16;
export const GUTTER = 8;
export const MIN_CELL_WIDTH = 320;
export const MIN_CELL_HEIGHT = 240;
export const DEFAULT_WINDOW_SIZE = { w: 1200, h: 800 };
export const SNAP_TOLERANCE = 12;
export const GROUP_PADDING = 32;
// The draggable group tab is rendered outside the group body, so it should
// not consume additional space inside the group's content bounds.
export const GROUP_HEADER = 0;

export const ALLOWED_RATIOS = [0.5, 0.382, 0.618, 0.333, 0.667, 0.25, 0.75];
