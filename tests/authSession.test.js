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

  test('fails closed when regeneration is unavailable', async () => {
    await expect(establishAuthenticatedSession({ session: {} }, {
      id: 9, role: 'user', email: 'beta@example.com',
    })).rejects.toThrow('session regeneration is unavailable');
  });
});
