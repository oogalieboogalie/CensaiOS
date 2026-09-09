// Built-in layout presets — semantic workspace plus fixed BSP trees.
import {
  buildSemanticWorkspaceLayout,
  orderWindowsByRole,
  SEMANTIC_PRESET,
} from './semantic.js';

export function getBuiltInPresets(windowsOrCount) {
  const count = Array.isArray(windowsOrCount) ? windowsOrCount.length : windowsOrCount;
  if (count <= 1) return [];
  if (count === 2) return [
    SEMANTIC_PRESET,
    { id: 'SPLIT_LR', label: 'Split (Left / Right)', preview: 'columns' },
    { id: 'SPLIT_TB', label: 'Split (Top / Bottom)', preview: 'rows' }
  ];
  if (count === 3) return [
    SEMANTIC_PRESET,
    { id: 'STACK_LEFT_MAIN_RIGHT', label: 'Stack Left + Main Right', preview: 'leftStack' },
    { id: 'MAIN_LEFT_STACK_RIGHT', label: 'Main Left + Stack Right', preview: 'rightStack' },
    { id: 'THREE_COLUMNS', label: 'Three Columns', preview: 'columns3' }
  ];
  if (count === 4) return [
    SEMANTIC_PRESET,
    { id: 'QUAD', label: 'Quad Grid', preview: 'quad' },
    { id: 'DASHBOARD_1', label: 'Dashboard', preview: 'dashboard' },
    { id: 'STACK_LEFT_TWO_MAINS', label: 'Stack Left + 2 Mains', preview: 'leftStack' },
    { id: 'TWO_MAINS_STACK_RIGHT', label: '2 Mains + Stack Right', preview: 'rightStack' }
  ];
  if (count === 5) return [
    SEMANTIC_PRESET,
    { id: 'SIDE_STACKS_MAIN_CENTER', label: 'Side Stacks + Main Center', preview: 'sideStacks' },
    { id: 'MAIN_PLUS_QUAD', label: 'Main + Quad Grid', preview: 'mainQuad' },
    { id: 'FIVE_COLUMNS', label: 'Five Columns', preview: 'columns3' }
  ];
  if (count >= 6) return [
    SEMANTIC_PRESET,
    { id: 'SIDE_STACKS_TWO_MAINS', label: 'Side Stacks + 2 Mains', preview: 'sideStacks' }
  ];
  return [];
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
