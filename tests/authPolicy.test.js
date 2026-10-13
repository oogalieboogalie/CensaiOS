import { jest } from '@jest/globals';
import {
  findOrCreateAuthorizedUser,
  isDeveloperLoginAllowed,
  isSessionAuthorized,
  resolveUserAccess,
} from '../server/security/authPolicy.js';

describe('private-beta auth policy', () => {
  test('preserves local first-user bootstrap', () => {
    expect(resolveUserAccess({
      email: 'owner@example.com',
      userCount: 0,
      runtimeMode: 'local_desktop',
      env: {},
    })).toMatchObject({ allowed: true, role: 'admin' });
  });

  test('keeps non-local signup closed unless invited or explicitly public', () => {
    expect(resolveUserAccess({
      email: 'visitor@example.com',
      runtimeMode: 'cloud_saas',
      env: {},
    })).toEqual({ allowed: false, reason: 'invite_required' });

    expect(resolveUserAccess({
      email: 'invited@example.com',
      runtimeMode: 'private_server',
      env: { ALLOWED_USERS: 'invited@example.com' },
    })).toMatchObject({ allowed: true, role: 'user' });

    expect(resolveUserAccess({
      email: 'founder@example.com',
      runtimeMode: 'cloud_saas',
      env: { CENSAI_ADMIN_EMAILS: 'founder@example.com' },
    })).toMatchObject({ allowed: true, role: 'admin' });
  });

  test('denies before insert when a new cloud user is not invited', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }),
    };

    const result = await findOrCreateAuthorizedUser({
      db,
      email: 'visitor@example.com',
      name: 'Visitor',
      runtimeMode: 'cloud_saas',
      env: {},
    });

    expect(result).toEqual({ allowed: false, reason: 'invite_required' });
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  });

  test('requires an authorized email in non-local sessions', () => {
    const options = {
      runtimeMode: 'cloud_saas',
      env: { ALLOWED_USERS: 'beta@example.com' },
    };
    expect(isSessionAuthorized({ userId: 7 }, options)).toBe(false);
    expect(isSessionAuthorized({ userId: 7, userEmail: 'other@example.com' }, options)).toBe(false);
    expect(isSessionAuthorized({ userId: 7, userEmail: 'BETA@example.com' }, options)).toBe(true);
  });

  test('developer login is local by default, explicit on private servers, and never cloud', () => {
    expect(isDeveloperLoginAllowed({ runtimeMode: 'local_desktop', env: {} })).toBe(true);
    expect(isDeveloperLoginAllowed({ runtimeMode: 'private_server', env: {} })).toBe(false);
    expect(isDeveloperLoginAllowed({
      runtimeMode: 'private_server',
      env: { CENSAI_ALLOW_DEVELOPER_LOGIN: 'true' },
    })).toBe(true);
    expect(isDeveloperLoginAllowed({
      runtimeMode: 'cloud_saas',
      env: { CENSAI_ALLOW_DEVELOPER_LOGIN: 'true' },
    })).toBe(false);
  });
});
