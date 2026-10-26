// Seed content for the Obsidian-like vault window (visual preset, not a clone).

export const VAULT_BASES = Object.freeze([
  'Books', 'Recipes', 'Kanban', 'Projects', 'Locations', 'Everything', 'People',
  'Movies', 'Trips', 'Shows', 'Albums', 'Restaurants', 'Meetings', 'Events',
  'Clippings', 'Companies', 'Journal', 'Podcasts', 'Author',
]);

export const VAULT_FOLDERS = Object.freeze(['Clippings', 'Ideas', 'Images', 'Meta']);

export const DEFAULT_NOTE_TITLE = 'Brown butter nectarine tart';

export const DEFAULT_NOTE_PATH = Object.freeze([
  'Users', 'alma', 'Desktop', 'Downloads', 'Brown butter nectarine tart',
]);

export const DEFAULT_NOTE_TEXT = [
  '- Brown the butter until nutty and fragrant',
  '- Toss sliced nectarines with sugar and a pinch of salt',
  '- Blind-bake a flaky tart shell until pale gold',
  '- Fold nectarines into the browned butter custard',
  '- Bake until the center just sets, then cool before slicing',
].join('\n');

export function noteStats(text = '') {
  const trimmed = String(text);
  const words = trimmed.trim() ? trimmed.trim().split(/\s+/).length : 0;
  return { words, characters: trimmed.length, backlinks: 0 };
}
