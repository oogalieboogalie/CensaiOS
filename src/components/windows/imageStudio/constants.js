export const IMAGE_STUDIO_MODELS = [
  { id: 'imagen-4.0-generate-001', label: 'Standard' },
  { id: 'imagen-4.0-ultra-generate-001', label: 'Ultra' },
  { id: 'imagen-4.0-fast-generate-001', label: 'Fast' },
];

export const IMAGE_STUDIO_TOOLS = [
  { id: 'select', label: 'Select' },
  { id: 'path', label: 'Pencil' },
  { id: 'rect', label: 'Rect' },
  { id: 'ellipse', label: 'Circle' },
  { id: 'line', label: 'Line' },
  { id: 'text', label: 'Text' },
];

export const IMAGE_STUDIO_COLORS = [
  '#ffffff',
  '#ff4d5f',
  '#ff8a3d',
  '#ffd84d',
  '#3fe47a',
  '#34d5ff',
  '#5b7cff',
  '#b46cff',
  '#08090d',
];

export const STROKE_SIZES = [
  { id: 'small', label: 'S', value: 2 },
  { id: 'medium', label: 'M', value: 5 },
  { id: 'large', label: 'L', value: 9 },
];

export const DEFAULT_IMAGE_STUDIO_STATE = Object.freeze({
  objects: Object.freeze([]),
  selectedObjectId: null,
  prompt: '',
  additionalInstructions: '',
  model: 'imagen-4.0-generate-001',
});
