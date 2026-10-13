// Built-in layout presets — semantic workspace plus fixed BSP trees.
import {
  buildSemanticWorkspaceLayout,
  orderWindowsByRole,
  SEMANTIC_PRESET,
} from './semantic.js';

// Common layouts work for any number of windows (2+). They come first in the
// menu so a group always offers the same familiar shapes; the count-specific
// ones below are extras for that exact window count.
export const COMMON_PRESETS = Object.freeze([
  Object.freeze({ id: 'COLUMNS', label: 'Side by side', preview: 'columns' }),
  Object.freeze({ id: 'ROWS', label: 'Stacked', preview: 'rows' }),
  Object.freeze({ id: 'GRID', label: 'Grid', preview: 'quad' }),
  Object.freeze({ id: 'MAIN_SIDEBAR', label: 'Main + sidebar', preview: 'rightStack' }),
]);

// Count-specific extras. Shapes the common set already covers (left/right
// split, three columns, quad, five columns, main + right stack) are left out
// of the menu; their ids still arrange for groups saved with them.
const COUNT_PRESETS = {
  3: [{ id: 'STACK_LEFT_MAIN_RIGHT', label: 'Stack left + main right', preview: 'leftStack' }],
  4: [
    { id: 'DASHBOARD_1', label: 'Dashboard', preview: 'dashboard' },
    { id: 'STACK_LEFT_TWO_MAINS', label: 'Stack left + 2 mains', preview: 'leftStack' },
    { id: 'TWO_MAINS_STACK_RIGHT', label: '2 mains + stack right', preview: 'rightStack' },
  ],
  5: [
    { id: 'SIDE_STACKS_MAIN_CENTER', label: 'Side stacks + main center', preview: 'sideStacks' },
    { id: 'MAIN_PLUS_QUAD', label: 'Main + quad grid', preview: 'mainQuad' },
  ],
};
const SIX_PLUS = [{ id: 'SIDE_STACKS_TWO_MAINS', label: 'Side stacks + 2 mains', preview: 'sideStacks' }];

export function getBuiltInPresets(windowsOrCount) {
  const count = Array.isArray(windowsOrCount) ? windowsOrCount.length : windowsOrCount;
  if (!(count >= 2)) return [];
  const extras = count >= 6 ? SIX_PLUS : (COUNT_PRESETS[count] || []);
  return [SEMANTIC_PRESET, ...COMMON_PRESETS, ...extras];
}

const leaf = (windowId) => ({ type: 'leaf', windowId });

// N equal slices along one axis ('vertical' = side by side columns).
function equalSplit(ids, axis) {
  if (ids.length === 0) return null;
  if (ids.length === 1) return leaf(ids[0]);
  return { type: 'split', axis, ratio: 1 / ids.length, first: leaf(ids[0]), second: equalSplit(ids.slice(1), axis) };
}

function equalSplitNodes(nodes, axis) {
  if (nodes.length === 1) return nodes[0];
  return { type: 'split', axis, ratio: 1 / nodes.length, first: nodes[0], second: equalSplitNodes(nodes.slice(1), axis) };
}

// Near-square grid: ceil(sqrt(n)) columns, rows filled left to right. A short
// last row stretches to the full width so there are no holes.
function gridLayout(ids) {
  const cols = Math.ceil(Math.sqrt(ids.length));
  const rows = [];
  for (let i = 0; i < ids.length; i += cols) rows.push(equalSplit(ids.slice(i, i + cols), 'vertical'));
  return equalSplitNodes(rows, 'horizontal');
}

// Biggest window keeps the main slot (it is usually the one you work in);
// the rest stack down a sidebar on the right.
function mainSidebarLayout(windows, ids) {
  const area = (w) => (typeof w === 'object' && Number.isFinite(w.w) && Number.isFinite(w.h) ? w.w * w.h : 0);
  const byId = new Map(windows.map((w) => [w.id || w, w]));
  const mainId = ids.reduce((best, id) => (area(byId.get(id)) > area(byId.get(best)) ? id : best), ids[0]);
  const rest = ids.filter((id) => id !== mainId);
  return { type: 'split', axis: 'vertical', ratio: 0.667, first: leaf(mainId), second: equalSplit(rest, 'horizontal') };
}

export function applyPreset(presetId, windows) {
  if (presetId === SEMANTIC_PRESET.id) {
    return buildSemanticWorkspaceLayout(windows.map((window) => (
      typeof window === 'string' ? { id: window, kind: 'generic' } : window
    )));
  }
  const ids = orderWindowsByRole(windows).map(w => w.id || w);
  if (ids.length === 0) return null;
  if (ids.length === 1) return { type: 'leaf', windowId: ids[0] };

  if (presetId === 'COLUMNS') return equalSplit(ids, 'vertical');
  if (presetId === 'ROWS') return equalSplit(ids, 'horizontal');
  if (presetId === 'GRID') return gridLayout(ids);
  if (presetId === 'MAIN_SIDEBAR') return mainSidebarLayout(windows, ids);

  // N=2
  if (presetId === 'SPLIT_LR' && ids.length >= 2) {
    return { type: 'split', axis: 'vertical', ratio: 0.5, first: { type: 'leaf', windowId: ids[0] }, second: { type: 'leaf', windowId: ids[1] } };
  }
  if (presetId === 'SPLIT_TB' && ids.length >= 2) {
    return { type: 'split', axis: 'horizontal', ratio: 0.5, first: { type: 'leaf', windowId: ids[0] }, second: { type: 'leaf', windowId: ids[1] } };
  }

  // N=3
  if (presetId === 'STACK_LEFT_MAIN_RIGHT' && ids.length >= 3) {
    return {
      type: 'split', axis: 'vertical', ratio: 0.5,
      first: { type: 'split', axis: 'horizontal', ratio: 0.5, first: { type: 'leaf', windowId: ids[0] }, second: { type: 'leaf', windowId: ids[1] } },
      second: { type: 'leaf', windowId: ids[2] }
    };
  }
  if (presetId === 'MAIN_LEFT_STACK_RIGHT' && ids.length >= 3) {
    return {
      type: 'split', axis: 'vertical', ratio: 0.5,
      first: { type: 'leaf', windowId: ids[0] },
      second: { type: 'split', axis: 'horizontal', ratio: 0.5, first: { type: 'leaf', windowId: ids[1] }, second: { type: 'leaf', windowId: ids[2] } }
    };
  }
  if (presetId === 'THREE_COLUMNS' && ids.length >= 3) {
    return {
      type: 'split', axis: 'vertical', ratio: 0.333,
      first: { type: 'leaf', windowId: ids[0] },
      second: { type: 'split', axis: 'vertical', ratio: 0.5, first: { type: 'leaf', windowId: ids[1] }, second: { type: 'leaf', windowId: ids[2] } }
    };
  }

  // N=4
  if (presetId === 'QUAD' && ids.length >= 4) {
    return {
      type: 'split', axis: 'vertical', ratio: 0.5,
      first: { type: 'split', axis: 'horizontal', ratio: 0.5, first: { type: 'leaf', windowId: ids[0] }, second: { type: 'leaf', windowId: ids[1] } },
      second: { type: 'split', axis: 'horizontal', ratio: 0.5, first: { type: 'leaf', windowId: ids[2] }, second: { type: 'leaf', windowId: ids[3] } }
    };
  }
  if (presetId === 'DASHBOARD_1' && ids.length >= 4) {
    // Left 50% split TB (40/60). Top is split LR (50/50). Right is main 50%.
    return {
      type: 'split', axis: 'vertical', ratio: 0.5,
      first: {
        type: 'split', axis: 'horizontal', ratio: 0.4,
        first: { type: 'split', axis: 'vertical', ratio: 0.5, first: { type: 'leaf', windowId: ids[0] }, second: { type: 'leaf', windowId: ids[1] } },
        second: { type: 'leaf', windowId: ids[2] }
      },
      second: { type: 'leaf', windowId: ids[3] }
    };
  }
  if (presetId === 'STACK_LEFT_TWO_MAINS' && ids.length >= 4) {
    // 3 columns: 20% stacked, 20% main, 60% main.
    return {
      type: 'split', axis: 'vertical', ratio: 0.4,
      first: {
        type: 'split', axis: 'vertical', ratio: 0.5,
        first: { type: 'split', axis: 'horizontal', ratio: 0.5, first: { type: 'leaf', windowId: ids[0] }, second: { type: 'leaf', windowId: ids[1] } },
        second: { type: 'leaf', windowId: ids[2] }
      },
      second: { type: 'leaf', windowId: ids[3] }
    };
  }
  if (presetId === 'TWO_MAINS_STACK_RIGHT' && ids.length >= 4) {
    // 3 equal columns: 33% main, 33% main, 33% stacked.
    return {
      type: 'split', axis: 'vertical', ratio: 0.667,
      first: { type: 'split', axis: 'vertical', ratio: 0.5, first: { type: 'leaf', windowId: ids[0] }, second: { type: 'leaf', windowId: ids[1] } },
      second: { type: 'split', axis: 'horizontal', ratio: 0.5, first: { type: 'leaf', windowId: ids[2] }, second: { type: 'leaf', windowId: ids[3] } }
    };
  }

  // N=5
  if (presetId === 'SIDE_STACKS_MAIN_CENTER' && ids.length >= 5) {
    // 3 columns: 20% stacked, 60% main, 20% stacked
    return {
      type: 'split', axis: 'vertical', ratio: 0.2,
      first: { type: 'split', axis: 'horizontal', ratio: 0.5, first: { type: 'leaf', windowId: ids[0] }, second: { type: 'leaf', windowId: ids[1] } },
      second: {
        type: 'split', axis: 'vertical', ratio: 0.75,
        first: { type: 'leaf', windowId: ids[2] },
        second: { type: 'split', axis: 'horizontal', ratio: 0.5, first: { type: 'leaf', windowId: ids[3] }, second: { type: 'leaf', windowId: ids[4] } }
      }
    };
  }
  if (presetId === 'MAIN_PLUS_QUAD' && ids.length >= 5) {
    return {
      type: 'split', axis: 'vertical', ratio: 0.618,
      first: { type: 'leaf', windowId: ids[0] },
      second: {
        type: 'split', axis: 'vertical', ratio: 0.5,
        first: { type: 'split', axis: 'horizontal', ratio: 0.5, first: { type: 'leaf', windowId: ids[1] }, second: { type: 'leaf', windowId: ids[2] } },
        second: { type: 'split', axis: 'horizontal', ratio: 0.5, first: { type: 'leaf', windowId: ids[3] }, second: { type: 'leaf', windowId: ids[4] } }
      }
    };
  }
  if (presetId === 'FIVE_COLUMNS' && ids.length >= 5) {
    return {
      type: 'split', axis: 'vertical', ratio: 0.2,
      first: { type: 'leaf', windowId: ids[0] },
      second: {
        type: 'split', axis: 'vertical', ratio: 0.25,
        first: { type: 'leaf', windowId: ids[1] },
        second: {
          type: 'split', axis: 'vertical', ratio: 0.333,
          first: { type: 'leaf', windowId: ids[2] },
          second: {
            type: 'split', axis: 'vertical', ratio: 0.5,
            first: { type: 'leaf', windowId: ids[3] },
            second: { type: 'leaf', windowId: ids[4] }
          }
        }
      }
    };
  }

  // N=6
  if (presetId === 'SIDE_STACKS_TWO_MAINS' && ids.length >= 6) {
    // 4 columns: 20% stacked, 30% main, 30% main, 20% stacked
    return {
      type: 'split', axis: 'vertical', ratio: 0.2,
      first: { type: 'split', axis: 'horizontal', ratio: 0.5, first: { type: 'leaf', windowId: ids[0] }, second: { type: 'leaf', windowId: ids[1] } },
      second: {
        type: 'split', axis: 'vertical', ratio: 0.75, // Remaining 80%. Target 30% is 30/80 = 0.375
        first: {
          type: 'split', axis: 'vertical', ratio: 0.5, // 2 equal 30% mains
          first: { type: 'leaf', windowId: ids[2] },
          second: { type: 'leaf', windowId: ids[3] }
        },
        second: { type: 'split', axis: 'horizontal', ratio: 0.5, first: { type: 'leaf', windowId: ids[4] }, second: { type: 'leaf', windowId: ids[5] } }
      }
    };
  }

  return { type: 'leaf', windowId: ids[0] };
}
