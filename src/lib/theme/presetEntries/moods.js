// src/lib/theme/presetEntries/moods.js
//
// Mood entries for PRESET_LIBRARY v0.1 (brief A2). Aggregator that merges
// per-category mood files into the single MOOD_ENTRIES object the upstream
// presetLibrary.js consumes.
//
// Categories:
//   - natural       → cream, cobalt-deep, slate, linen, midnight, forest, coal
//   - vendor        → openai, gemini, anthropic, xai, moonshot, perplexity, mistral
//   - os            → google, meta, microsoft, apple, apple-dark
//   - hacker        → matrix, synthwave, cyberpunk, vaporwave, tron, hacker
//   - retro         → win98
//   - spotlight     → trusty-blue … arctic (recognizable crowd-pleasers)
//   - acrylic       → acrylic-cobalt … acrylic-kelly (hard vivid colorways)
//   - neurodivergent → calm-focus, low-stim, sensory-soft, gentle-contrast (brief A4)

import { NATURAL_MOODS } from './moodsNatural.js';
import { VENDOR_MOODS } from './moodsVendor.js';
import { OS_MOODS } from './moodsOs.js';
import { HACKER_MOODS } from './moodsHacker.js';
import { RETRO_MOODS } from './moodsRetro.js';
import { CLASSIC_MOODS } from './moodsClassics.js';
import { POP_MOODS } from './moodsPop.js';
import { ACRYLIC_MOODS } from './moodsAcrylic.js';
import { NEURODIVERGENT_MOODS } from './neurodivergent.js';

export const MOOD_ENTRIES = {
  ...NATURAL_MOODS,
  ...VENDOR_MOODS,
  ...OS_MOODS,
  ...HACKER_MOODS,
  ...RETRO_MOODS,
  ...CLASSIC_MOODS,
  ...POP_MOODS,
  ...ACRYLIC_MOODS,
  ...NEURODIVERGENT_MOODS,
};