import React from 'react';
import { api } from '../../lib/api.js';
import { logFailure } from '../../lib/appLog/browserLog.js';

export function usePresetBootstrap(authenticated, setPresets) {
  React.useEffect(() => {
    if (!authenticated) return;
    api.getPresets()
      .then((presets) => setPresets(presets || []))
      .catch((error) => logFailure('presets: could not load presets', error, 'presets'));
  }, [authenticated, setPresets]);
}
