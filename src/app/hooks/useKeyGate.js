import React from 'react';
import { markKeySetupDone, shouldOfferKeySetup, shouldShowSovereignAccessGate } from '../../lib/sovereignAccess.js';

/**
 * Which key screen to show after sign-in, as props for SovereignAccessGate,
 * or null for none: the cloud gate (a key is required), or the Docker
 * install's one-time "Connect your AI" screen (a key is optional).
 */
export function useKeyGate(session) {
  const [unlocked, setUnlocked] = React.useState(false);
  const [setupDone, setSetupDone] = React.useState(false);
  const unlock = React.useCallback(() => setUnlocked(true), []);
  const finishSetup = React.useCallback(() => {
    markKeySetupDone(globalThis.localStorage);
    setSetupDone(true);
  }, []);
  if (shouldShowSovereignAccessGate(session, unlocked)) return { onConfigured: unlock };
  if (shouldOfferKeySetup(session, globalThis.localStorage, setupDone)) {
    return { onConfigured: finishSetup, onSkip: finishSetup };
  }
  return null;
}
