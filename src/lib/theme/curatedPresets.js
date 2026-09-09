// Keep the settings surface intentionally small. The full preset library still
// powers integrations and saved themes; these are the distinct starting points
// worth presenting to a person customizing the canvas.
export const CURATED_MOOD_IDS = Object.freeze([
  'cream',
  'linen',
  'slate',
  'cobalt-deep',
  'midnight',
  'forest',
  'coal',
  'win98',
]);

export const CURATED_ACCENT_IDS = Object.freeze([
  'moss',
  'ocean',
  'cobalt',
  'plum',
  'rose',
  'amber',
  'rust',
]);

export function formatPresetLabel(id) {
  return id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
