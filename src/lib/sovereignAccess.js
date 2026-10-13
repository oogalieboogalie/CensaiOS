export function shouldShowSovereignAccessGate(session, unlocked = false) {
  return Boolean(session?.requiresUserApiKey) && !unlocked;
}

export const KEY_SETUP_DONE_KEY = 'censai.keySetup.done';

/**
 * The Docker install shows the same "Connect your AI" screen once, with a
 * Skip button, until a key is saved or it is skipped in this browser.
 */
export function shouldOfferKeySetup(session, storage, done = false) {
  if (done || !session?.authenticated || !session?.offerKeySetup) return false;
  if (session.requiresUserApiKey) return false;
  try {
    return storage?.getItem(KEY_SETUP_DONE_KEY) !== '1';
  } catch {
    return false;
  }
}

export function markKeySetupDone(storage) {
  try {
    storage?.setItem(KEY_SETUP_DONE_KEY, '1');
  } catch {
    // Private windows can refuse storage; the screen just shows next time.
  }
}
