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

// Spotlight moods: recognizable crowd-pleaser colorways. The theme-panel
// Randomize button cycles through these so every click lands somewhere
// people go "oohh" at — classics first, then the loud ones.
export const SPOTLIGHT_MOOD_IDS = Object.freeze([
  'trusty-blue',
  'ink-paper',
  'slate-corporate',
  'forest-gold',
  'ocean-calm',
  'warm-cream',
  'arctic',
  'matcha',
  'denim',
  'lagoon',
  'bubblegum',
  'golden-hour',
  'midnight-neon',
  'deep-ocean',
  'grape-soda',
  'sunset-strip',
  'charcoal-citrus',
  'blush-noir',
  'ember',
  'citrus-pop',
  'acrylic-cobalt',
  'acrylic-crimson',
  'acrylic-venom',
  'acrylic-magenta',
  'acrylic-tangerine',
  'acrylic-poppy',
  'acrylic-royal',
  'acrylic-kelly',
]);

// Randomize pool: the high-contrast crowd-pleasers only. The quiet
// near-white moods stay clickable as chips below but never come up on
// Randomize, so every click is a "oohh" moment for video.
export const RANDOMIZE_MOOD_IDS = Object.freeze([
  'forest-gold',
  'lagoon',
  'bubblegum',
  'golden-hour',
  'citrus-pop',
  'midnight-neon',
  'deep-ocean',
  'grape-soda',
  'sunset-strip',
  'charcoal-citrus',
  'blush-noir',
  'ember',
  'acrylic-cobalt',
  'acrylic-crimson',
  'acrylic-venom',
  'acrylic-magenta',
  'acrylic-tangerine',
  'acrylic-poppy',
  'acrylic-royal',
  'acrylic-kelly',
]);

// Pick a random spotlight mood that isn't the current one (pure, testable).
export function pickSpotlightMood(currentId, rand = Math.random) {
  const pool = RANDOMIZE_MOOD_IDS.filter((id) => id !== currentId);
  const list = pool.length > 0 ? pool : [...RANDOMIZE_MOOD_IDS];
  return list[Math.floor(rand() * list.length)];
}

export function formatPresetLabel(id) {
  return id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
