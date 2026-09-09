export const SETTINGS_TABS = Object.freeze([
  { id: 'appearance', label: 'Appearance' },
  { id: 'workspace', label: 'Canvas' },
  { id: 'sharing', label: 'Sharing' },
  { id: 'vault', label: 'AI keys' },
]);

const SETTINGS_TAB_IDS = new Set(SETTINGS_TABS.map((tab) => tab.id));

export function normalizeSettingsTab(value) {
  return SETTINGS_TAB_IDS.has(value) ? value : 'appearance';
}
