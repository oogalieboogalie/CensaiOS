// Layout algorithm — barrel.
// The implementation was split into ./layout/* (constants, grid, bounds, infer,
// presets) so each file is small and single-purpose. This file preserves the
// original public API: every existing `import { ... } from '.../layoutAlgo.js'`
// keeps working unchanged.

export {
  BASE_UNIT,
  GUTTER,
  MIN_CELL_WIDTH,
  MIN_CELL_HEIGHT,
  DEFAULT_WINDOW_SIZE,
  SNAP_TOLERANCE,
  GROUP_PADDING,
  GROUP_HEADER,
  ALLOWED_RATIOS,
} from './layout/constants.js';

export { snapToGrid, snapRatio } from './layout/grid.js';

export {
  getWindowBounds,
  makeGroupBoundsForWindows,
  getGroupInnerBounds,
  getMinLayoutSize,
  fitGroupToLayout,
  getOwningGroup,
} from './layout/bounds.js';

export { inferLayout, cleanLayout } from './layout/infer.js';

export { getBuiltInPresets, applyPreset } from './layout/presets.js';
export {
  buildSemanticWorkspaceLayout,
  orderWindowsByRole,
  SEMANTIC_PRESET,
} from './layout/semantic.js';
