// The Settings tabs. Other code opens a tab by its id, so ids never change;
// `intro` is the one line at the top of the tab.
export const SETTINGS_TABS = Object.freeze([
  { id: 'appearance', label: 'Appearance', intro: 'How censaiOS looks. Every change shows on the board right away.' },
  { id: 'workspace', label: 'Canvas', intro: 'How you move around the board and how windows fit together.' },
  { id: 'agents', label: 'Agents', intro: 'What agents may do without asking, and when they speak up on their own.' },
  { id: 'hotkeys', label: 'Hotkeys', intro: 'Keys that open a coding agent from anywhere on the board.' },
  { id: 'sharing', label: 'Sharing', intro: 'Who can open this board, and what they can do there.' },
  { id: 'anywhere', label: 'Open anywhere', intro: 'Open this censaiOS from your other computers, tablet or phone.' },
  { id: 'modules', label: 'Modules', intro: 'Modules people have shared, and which windows, agents, add-ons and themes this board offers.' },
  { id: 'vault', label: 'AI keys', intro: 'Your own keys for AI providers. Chats and agents use them in place of the shared ones.' },
]);

const SETTINGS_TAB_IDS = new Set(SETTINGS_TABS.map((tab) => tab.id));

export function normalizeSettingsTab(value) {
  return SETTINGS_TAB_IDS.has(value) ? value : 'appearance';
}

export function settingsTabIntro(id) {
  return SETTINGS_TABS.find((tab) => tab.id === id)?.intro || '';
}
