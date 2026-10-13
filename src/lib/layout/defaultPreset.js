// Which built-in layout should tidy a group when a window newly enters it?
//
// A group's "default layout" (the star in the layouts menu) is one of its
// SAVED snapshots, identified by a random id. The arrange engine
// (applyPreset) only understands built-in keys like 'QUAD', so the default
// is resolved to the built-in layout that snapshot was saved with. Passing
// the raw snapshot id through would arrange nothing sensible and overwrite
// the group's presetId with a meaningless id.
import { SEMANTIC_PRESET } from './semantic.js';

export function resolveGroupArrangePreset(group) {
  const saved = (group?.presets || []).find((p) => p.id === group?.defaultPresetId);
  return saved?.presetId || group?.presetId || SEMANTIC_PRESET.id;
}
