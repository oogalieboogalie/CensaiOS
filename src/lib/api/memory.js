import { readStoredJson, writeStoredJson, readLocalStoredJson, readServerStoredJson, JOURNALS_KEY, PRESETS_KEY, THEME_CUSTOM_PRESETS_KEY, STORAGE_MISS } from './storage.js';

/**
   * Fetches journals for all agents.
   * @returns {Promise<Object.<string, JournalEntry[]>>}
   */
export async function getJournals() {
    return readStoredJson(JOURNALS_KEY, {});
  }

/**
   * Saves all journals.
   * @param {Object.<string, JournalEntry[]>} journals
   * @returns {Promise<void>}
   */
export async function saveJournals(journals) {
    try {
      await writeStoredJson(JOURNALS_KEY, journals);
    } catch (e) {
      console.error('Failed to save journals', e);
    }
  }

/**
   * Fetches all presets.
   * @returns {Promise<Preset[]>}
   */
export async function getPresets() {
    const localValue = readLocalStoredJson(PRESETS_KEY);
    const serverValue = await readServerStoredJson(PRESETS_KEY);
    const presets = mergePresets(
      serverValue !== STORAGE_MISS ? serverValue : [],
      localValue !== STORAGE_MISS ? localValue : []
    );

    if (presets.length > 0) {
      await writeStoredJson(PRESETS_KEY, presets);
    }

    return presets;
  }

/**
   * Saves presets.
   * @param {Preset[]} presets
   * @param {{ allowEmpty?: boolean }} [options]
   * @returns {Promise<void>}
   */
export async function savePresets(presets, options = {}) {
    try {
      if (!Array.isArray(presets)) throw new Error('Presets must be an array');
      if (presets.length === 0 && !options.allowEmpty) {
        throw new Error('Refusing to save an empty preset list without allowEmpty=true.');
      }
      await writeStoredJson(PRESETS_KEY, presets, {
        allowEmpty: options.allowEmpty === true,
        requireServer: true,
      });
    } catch (e) {
      console.error('Failed to save presets', e);
      throw e;
    }
  }

/**
   * Fetches custom theme presets, migrating any browser-only presets into shared state.
   * @returns {Promise<Object[]>}
   */
export async function getThemeCustomPresets() {
    const localValue = readLocalStoredJson(THEME_CUSTOM_PRESETS_KEY);
    const serverValue = await readServerStoredJson(THEME_CUSTOM_PRESETS_KEY);
    const presets = mergeThemeCustomPresets(serverValue, localValue);

    if (presets.length > 0) {
      try {
        await writeStoredJson(THEME_CUSTOM_PRESETS_KEY, presets, { requireServer: true });
      } catch (e) {
        console.error('Failed to migrate theme custom presets into shared state', e);
      }
    }

    return presets;
  }

/**
   * Saves custom theme presets.
   * @param {Object[]} presets
   * @returns {Promise<void>}
   */
export async function saveThemeCustomPresets(presets) {
    if (!Array.isArray(presets)) throw new Error('Theme custom presets must be an array');
    await writeStoredJson(THEME_CUSTOM_PRESETS_KEY, presets, {
      allowEmpty: true,
      requireServer: true,
    });
  }


function mergePresets(...presetLists) {
  const merged = new Map();
  for (const list of presetLists) {
    for (const preset of coerceArrayState(list)) {
      if (!preset || typeof preset !== 'object') continue;
      const id = preset.id || `${preset.name || 'preset'}:${preset.createdAt || ''}`;
      merged.set(id, preset);
    }
  }
  return [...merged.values()].sort((a, b) => {
    const aTime = Date.parse(a.createdAt || '') || 0;
    const bTime = Date.parse(b.createdAt || '') || 0;
    return bTime - aTime;
  });
}

function coerceArrayState(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  const numericKeys = Object.keys(value).filter(key => /^\d+$/.test(key));
  if (numericKeys.length === 0) return [];
  return numericKeys
    .sort((a, b) => Number(a) - Number(b))
    .map(key => value[key])
    .filter(item => item && typeof item === 'object');
}

function mergeThemeCustomPresets(...presetLists) {
  const merged = new Map();
  for (const list of presetLists) {
    for (const preset of coerceArrayState(list)) {
      const id = preset.id || `${preset.name || 'theme'}:${preset.theme?.mood || ''}:${preset.createdAt || ''}`;
      merged.set(id, preset);
    }
  }
  return [...merged.values()].slice(0, 24);
}
