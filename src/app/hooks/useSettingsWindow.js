import React from 'react';
import { normalizeSettingsTab } from '../../components/theme/settingsTabs.js';

export function useSettingsWindow({ wins, spawnAt, setActiveId, onUpdate }) {
  return React.useCallback((requestedTab = 'appearance') => {
    const settingsTab = normalizeSettingsTab(requestedTab);
    const existing = wins.find((win) => win.kind === 'appearance');
    if (existing) {
      // Settings is a utility dialog: always bring it back into view.
      // (A persisted window can end up thousands of px off-canvas, and
      // focusing it then looks like the gear button does nothing.)
      onUpdate(existing.id, {
        settingsTab,
        settingsRequestId: crypto.randomUUID(),
        title: 'Settings',
        x: -480,
        y: -290,
        maximized: false,
      });
      setActiveId(existing.id);
      return existing.id;
    }
    return spawnAt('appearance', { title: 'Settings', settingsTab });
  }, [onUpdate, setActiveId, spawnAt, wins]);
}
