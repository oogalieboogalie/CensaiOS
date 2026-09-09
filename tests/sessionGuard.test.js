import { jest } from '@jest/globals';
import { requireAuthorizedSession } from '../server/security/sessionGuard.js';

function response() {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
}

describe('private-beta session guard', () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  test('returns 401 without an authenticated session', () => {
    const res = response();
    const next = jest.fn();

    requireAuthorizedSession({ session: {} }, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects an uninvited cloud session before API routing', () => {
    process.env.CENSAI_MODE = 'cloud_saas';
    process.env.ALLOWED_USERS = 'beta@example.com';
    const res = response();
    const next = jest.fn();

    requireAuthorizedSession({
      session: { userId: 7, userEmail: 'other@example.com' },
    }, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('allows an invited cloud session', () => {
    process.env.CENSAI_MODE = 'cloud_saas';
    process.env.ALLOWED_USERS = 'beta@example.com';
    const res = response();
    const next = jest.fn();

    requireAuthorizedSession({
      session: { userId: 7, userEmail: 'beta@example.com' },
    }, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
