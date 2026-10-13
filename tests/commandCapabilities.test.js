import {
  CapabilityDeniedError,
  checkCommandCapabilities,
  hasCapability,
} from '../server/capabilities/checkCapability.js';

describe('command capability enforcement', () => {
  test('administrators receive the wildcard grant', () => {
    expect(hasCapability({ userRole: 'admin' }, 'window.import')).toBe(true);
  });

  test('normal users receive workspace and artifact grants', () => {
    expect(hasCapability({ userRole: 'user' }, 'workspace.read')).toBe(true);
    expect(hasCapability({ userRole: 'user' }, 'artifact.write')).toBe(true);
  });

  test('normal users cannot import generated source', () => {
    expect(() => checkCommandCapabilities({
      requiredCapabilities: ['window.import'],
    }, {
      userRole: 'user',
    })).toThrow(CapabilityDeniedError);
  });

  test('unknown roles fail closed', () => {
    expect(hasCapability({ userRole: 'unknown' }, 'workspace.read')).toBe(false);
  });
});
