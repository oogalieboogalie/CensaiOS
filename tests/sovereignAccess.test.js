import { shouldShowSovereignAccessGate } from '../src/lib/sovereignAccess.js';

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
});
