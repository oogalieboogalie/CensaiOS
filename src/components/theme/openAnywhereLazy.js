import React from 'react';
import { logFailure, logToApp } from '../../lib/appLog/browserLog.js';

// The QR library rides with this section. Settings loads it when Open anywhere
// opens, instead of with the board.
export const OpenAnywhereSection = React.lazy(() => {
  logToApp('info', 'open anywhere section loading', { where: 'settings' });
  return import('./OpenAnywhereSection.jsx')
    .then((mod) => ({ default: mod.OpenAnywhereSection }))
    .catch((err) => {
      logFailure('open anywhere section failed to load', err, 'settings');
      throw err;
    });
});
