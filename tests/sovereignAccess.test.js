import {
  KEY_SETUP_DONE_KEY,
  markKeySetupDone,
  shouldOfferKeySetup,
  shouldShowSovereignAccessGate,
} from '../src/lib/sovereignAccess.js';

describe('sovereign access gate policy', () => {
  test('keeps local and private-server users on the canvas', () => {
    expect(shouldShowSovereignAccessGate({
      authenticated: true,
      runtimeMode: 'local_desktop',
      requiresUserApiKey: false,
    })).toBe(false);
    expect(shouldShowSovereignAccessGate({
      authenticated: true,
      runtimeMode: 'private_server',
      requiresUserApiKey: false,
    })).toBe(false);
  });

  test('blocks cloud users until a personal key is configured', () => {
    const session = {
      authenticated: true,
      runtimeMode: 'cloud_saas',
      requiresUserApiKey: true,
    };

    expect(shouldShowSovereignAccessGate(session, false)).toBe(true);
    expect(shouldShowSovereignAccessGate(session, true)).toBe(false);
  });

  test('offers the Docker install key screen once per browser', () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    const session = { authenticated: true, offerKeySetup: true, requiresUserApiKey: false };

    expect(shouldOfferKeySetup(session, storage)).toBe(true);
    expect(shouldOfferKeySetup(session, storage, true)).toBe(false);
    markKeySetupDone(storage);
    expect(store.get(KEY_SETUP_DONE_KEY)).toBe('1');
    expect(shouldOfferKeySetup(session, storage)).toBe(false);
  });

  test('never offers it outside the Docker install or in place of the cloud gate', () => {
    const storage = { getItem: () => null };
    expect(shouldOfferKeySetup({ authenticated: true, offerKeySetup: false }, storage)).toBe(false);
    expect(shouldOfferKeySetup({ authenticated: false, offerKeySetup: true }, storage)).toBe(false);
    expect(shouldOfferKeySetup({ authenticated: true, offerKeySetup: true, requiresUserApiKey: true }, storage)).toBe(false);
    expect(shouldOfferKeySetup({ authenticated: true, offerKeySetup: true }, { getItem: () => { throw new Error('blocked'); } })).toBe(false);
  });
});
