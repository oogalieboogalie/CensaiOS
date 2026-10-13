// Toolbar definitions extracted from Toolbar.jsx: tool metadata (with JSX
// glyphs), pen constants, and the small helpers the dock uses. No component
// state here — Toolbar.jsx owns all rendering and interaction.

export const TOOL_DEFS = [
  {
    id: 'select', label: 'Select', key: 'V',
    glyph: <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l7 18 3-7 7-3L3 3z" />,
  },
  {
    id: 'pan', label: 'Pan', key: 'H',
    glyph: <path strokeLinecap="round" strokeLinejoin="round" d="M9 11.5V13m0-3.5v-5a1.5 1.5 0 013 0m-3 5.5a1.5 1.5 0 00-3 0V12a7.5 7.5 0 0015 0v-4.5a1.5 1.5 0 00-3 0M12 8.5V11m0-6v-1a1.5 1.5 0 013 0v1m0 0V11m0-6a1.5 1.5 0 013 0v3m0 0V11" />,
  },
  {
    id: 'pen', label: 'Brush', key: 'P',
    glyph: <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />,
  },
  {
    id: 'eraser', label: 'Erase', key: 'E',
    glyph: <path strokeLinecap="round" strokeLinejoin="round" d="M20 20H7L3 16c-.5-.5-.5-1.5 0-2l10-10c.5-.5 1.5-.5 2 0l5 5c.5.5.5 1.5 0 2l-9 9" />,
  },
  {
    id: 'rect', label: 'Rectangle', key: 'R',
    glyph: <rect x="4" y="4" width="16" height="16" rx="2" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    id: 'text', label: 'Text', key: 'T',
    glyph: <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M12 6v14m-3 0h6" />,
  },
  {
    // Spec 9: loop around ink strokes to select them.
    id: 'lasso', label: 'Lasso', key: 'L',
    glyph: <path strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2.5 2.5" d="M12 4c4.4 0 8 2.2 8 5s-3.6 5-8 5-8-2.2-8-5 3.6-5 8-5zm-5 9.5c-.8 1.8-.4 3.6 1 4.5 1.3.8 2.4.4 2.4 2.5" />,
  },
];

export const AI_DEF = {
  id: 'ai-agent', label: 'AI Copilot', key: 'A',
  glyph: <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />,
};

// Momentary action (never becomes the active tool): focuses the existing
// Censai chat window or spawns one. Lives in the dock next to AI Copilot.
export const CHAT_DEF = {
  id: 'chat', label: 'Chat', key: 'C',
  glyph: <path strokeLinecap="round" strokeLinejoin="round" d="M21 12c0 4.4-4 8-9 8-1.4 0-2.7-.2-3.9-.7L3 21l1.4-4.4C3.5 15.2 3 13.7 3 12c0-4.4 4-8 9-8s9 3.6 9 8z" />,
};

// Theme tokens, so ink follows the look (spec 1) and reads as one muted set.
export const PEN_COLORS = ['var(--ink)', 'var(--canvas-pen-blue)', 'var(--canvas-pen-red)', 'var(--canvas-pen-amber)', 'var(--canvas-pen-green)', 'var(--canvas-pen-purple)'];
export const PEN_COLOR_NAMES = { 'var(--ink)': 'Ink', 'var(--canvas-pen-blue)': 'Blue', 'var(--canvas-pen-red)': 'Red', 'var(--canvas-pen-amber)': 'Amber', 'var(--canvas-pen-green)': 'Green', 'var(--canvas-pen-purple)': 'Purple' };
export const PEN_SIZES = [2, 4, 8];

export function broadcastToolChange(tool) {
  window.dispatchEvent(new CustomEvent('canvas:tool-change', { detail: { tool } }));
}

export function isEditingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.contentEditable === 'true';
}
