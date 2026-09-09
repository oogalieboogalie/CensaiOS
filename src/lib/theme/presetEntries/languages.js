/**
 * src/lib/theme/presetEntries/languages.js
 *
 * Language entries for PRESET_LIBRARY v0.1 (brief A2). Each value is an accent
 * preset: { label, accent: { hue, chroma, lightness } }.
 *
 * Migrated verbatim from the "Language stripe colorways" group at the bottom
 * of the original `THEME_PRESETS` object in `src/components/Theme.jsx`.
 *
 * Kept in a separate file from `presetLibrary.js` so the data table stays
 * within the 250-line size ratchet budget while preserving the single
 * source of truth.
 */
export const LANGUAGE_ENTRIES = {
  python:     { label: 'Python',     accent: { hue: 245, chroma: 0.10, lightness: 0.60 } },
  javascript: { label: 'JavaScript', accent: { hue: 100, chroma: 0.15, lightness: 0.80 } },
  typescript: { label: 'TypeScript', accent: { hue: 250, chroma: 0.13, lightness: 0.58 } },
  rustlang:   { label: 'Rust',       accent: { hue: 32,  chroma: 0.15, lightness: 0.58 } },
  golang:     { label: 'Go',         accent: { hue: 215, chroma: 0.12, lightness: 0.68 } },
  java:       { label: 'Java',       accent: { hue: 60,  chroma: 0.15, lightness: 0.66 } },
  csharp:     { label: 'C#',         accent: { hue: 285, chroma: 0.17, lightness: 0.54 } },
  cpp:        { label: 'C++',        accent: { hue: 245, chroma: 0.13, lightness: 0.54 } },
  ruby:       { label: 'Ruby',       accent: { hue: 28,  chroma: 0.16, lightness: 0.57 } },
  swift:      { label: 'Swift',      accent: { hue: 45,  chroma: 0.16, lightness: 0.68 } },
  kotlin:     { label: 'Kotlin',     accent: { hue: 290, chroma: 0.17, lightness: 0.62 } },
  elixir:     { label: 'Elixir',     accent: { hue: 320, chroma: 0.10, lightness: 0.52 } },
  bash:       { label: 'Bash',       accent: { hue: 140, chroma: 0.15, lightness: 0.62 } },
};