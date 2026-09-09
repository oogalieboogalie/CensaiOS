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
];

export const AI_DEF = {
  id: 'ai-agent', label: 'AI Copilot', key: 'A',
  glyph: <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />,
};

export const PEN_COLORS = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#FFFFFF'];
export const PEN_SIZES = [2, 4, 8];

export function broadcastToolChange(tool) {
  window.dispatchEvent(new CustomEvent('canvas:tool-change', { detail: { tool } }));
}

export function isEditingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.contentEditable === 'true';
}
