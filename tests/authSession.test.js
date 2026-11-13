import { establishAuthenticatedSession } from '../server/security/authSession.js';

describe('authenticated session establishment', () => {
  test('rotates before persisting identity', async () => {
    const events = [];
    const session = {
      regenerate(callback) {
        events.push('regenerate');
        callback();
      },
      save(callback) {
        events.push('save');
        callback();
      },
    };

    await establishAuthenticatedSession({ session }, {
      id: 9,
      role: 'user',
      email: 'beta@example.com',
    });

    expect(events).toEqual(['regenerate', 'save']);
    expect(session).toMatchObject({
      userId: 9,
      userRole: 'user',
      userEmail: 'beta@example.com',
    });
  });

  test('a hub sign-in stores no role, even when that email is an admin', async () => {
    const session = {
      regenerate(callback) { callback(); },
      save(callback) { callback(); },
    };

    await establishAuthenticatedSession({ session }, {
      id: '11111111-1111-4111-8111-111111111111',
      role: 'admin',
      email: 'alma@example.com',
      hubAccount: true,
    });

    expect(session.hubAccount).toBe(true);
    expect(session.userRole).toBeUndefined();
    expect(session.userEmail).toBe('alma@example.com');
  });

  test('fails closed when regeneration is unavailable', async () => {
    await expect(establishAuthenticatedSession({ session: {} }, {
      id: 9, role: 'user', email: 'beta@example.com',
    })).rejects.toThrow('session regeneration is unavailable');
  });
});
