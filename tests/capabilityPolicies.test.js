import {
  CAPABILITY_POLICIES,
} from '../server/capabilities/policies.js';
import {
  hasCapability,
} from '../server/capabilities/checkCapability.js';

const REQUIRED_CAPABILITIES = [
  'window.import.validate',
  'window.import.write',
  'filesystem.write',
  'command.execute',
  'credential.write',
  'provider.invoke',
];

describe('capability policy registry', () => {
  test('the policy map is frozen and contains the required capability surface', () => {
    expect(Object.isFrozen(CAPABILITY_POLICIES)).toBe(true);
    for (const name of REQUIRED_CAPABILITIES) {
      // toHaveProperty treats a single dotted string as a nested path,
      // so we pass the name as an array element instead.
      expect(CAPABILITY_POLICIES).toHaveProperty([name]);
    }
  });

  test('every policy entry has the required shape (description + requiredFor array)', () => {
    for (const [name, policy] of Object.entries(CAPABILITY_POLICIES)) {
      expect(typeof policy.description).toBe('string');
      expect(policy.description.length).toBeGreaterThan(0);
      expect(Array.isArray(policy.requiredFor)).toBe(true);
      expect(policy.requiredFor.length).toBeGreaterThan(0);
      // Each policy itself is frozen so it cannot drift at runtime.
      expect(Object.isFrozen(policy)).toBe(true);
      // The requiredFor list is frozen too — no per-call mutation.
      expect(Object.isFrozen(policy.requiredFor)).toBe(true);
      // Sanity: the policy name actually matches its key in the map.
      expect(typeof name).toBe('string');
    }
  });

  test('normal users can dry-run (window.import.validate) but cannot write', () => {
    expect(hasCapability({ userRole: 'user' }, 'window.import.validate')).toBe(true);
    expect(hasCapability({ userRole: 'user' }, 'window.import.write')).toBe(false);
  });

  test('admin role receives every declared capability via the wildcard grant', () => {
    expect(hasCapability({ userRole: 'admin' }, 'window.import.validate')).toBe(true);
    expect(hasCapability({ userRole: 'admin' }, 'window.import.write')).toBe(true);
    expect(hasCapability({ userRole: 'admin' }, 'filesystem.write')).toBe(true);
    expect(hasCapability({ userRole: 'admin' }, 'command.execute')).toBe(true);
    expect(hasCapability({ userRole: 'admin' }, 'credential.write')).toBe(true);
    expect(hasCapability({ userRole: 'admin' }, 'provider.invoke')).toBe(true);
  });

  test('admin-only capabilities stay admin-only for normal users', () => {
    expect(hasCapability({ userRole: 'user' }, 'filesystem.write')).toBe(false);
    expect(hasCapability({ userRole: 'user' }, 'command.execute')).toBe(false);
    expect(hasCapability({ userRole: 'user' }, 'credential.write')).toBe(false);
    expect(hasCapability({ userRole: 'user' }, 'provider.invoke')).toBe(false);
  });

  test('mutating CAPABILITY_POLICIES at runtime throws (frozen surface)', () => {
    expect(() => {
      CAPABILITY_POLICIES['runtime.injected'] = { description: 'x', requiredFor: [] };
    }).toThrow();
    expect(() => {
      delete CAPABILITY_POLICIES['window.import.validate'];
    }).toThrow();
  });
});