import {
  getClientAccessPolicy,
  requiresPersonalApiKey,
} from '../server/security/byokPolicy.js';

describe('BYOK deployment policy', () => {
  test('local and private installs use the server-managed provider route', () => {
    expect(requiresPersonalApiKey('user', 'local_desktop')).toBe(false);
    expect(requiresPersonalApiKey('user', 'private_server')).toBe(false);
  });

  test('cloud production requires BYOK only for non-admin users', () => {
    expect(requiresPersonalApiKey('user', 'cloud_saas')).toBe(true);
    expect(requiresPersonalApiKey('admin', 'cloud_saas')).toBe(false);
    expect(getClientAccessPolicy('user', 'cloud_saas')).toEqual({
      runtimeMode: 'cloud_saas',
      requiresUserApiKey: true,
    });
  });
});
