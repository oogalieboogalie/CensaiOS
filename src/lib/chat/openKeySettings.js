import { useWorkspaceStore } from '../store.js';
import { newId } from '../ids/newId.js';

/** Opens Settings on the "AI keys" tab, from anywhere on the board. */
export function openKeySettings() {
  const state = useWorkspaceStore.getState();
  const existing = state.wins.find(win => win.kind === 'appearance');
  if (existing) {
    state.onUpdate(existing.id, {
      settingsTab: 'vault',
      settingsRequestId: newId(),
      title: 'Settings',
      x: -480,
      y: -290,
      maximized: false,
    });
    state.setActiveId(existing.id);
    return existing.id;
  }
  return state.spawnAt('appearance', { title: 'Settings', settingsTab: 'vault' });
}
