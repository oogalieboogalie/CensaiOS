import React from 'react';
import { api } from '../../lib/api.js';

export function usePresetBootstrap(authenticated, setPresets) {
  React.useEffect(() => {
    if (!authenticated) return;
    api.getPresets()
      .then((presets) => setPresets(presets || []))
      .catch((error) => console.warn('Failed to load presets', error));
  }, [authenticated, setPresets]);
}
