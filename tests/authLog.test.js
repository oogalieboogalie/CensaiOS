import { jest } from '@jest/globals';
import fs from 'fs';

const lines = [];
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: (namespace) => {
    const write = (level) => (msg, meta) => lines.push({ namespace, level, msg, meta });
    return { info: write('info'), warn: write('warn'), error: write('error'), debug: () => {} };
  },
}));

const { authErrorCode, logAuthProblem } = await import('../server/security/authLog.js');

afterEach(() => { lines.length = 0; });

describe('sign-in problems in the app log', () => {
  test('a database error logs the reason and its code, never the email in the message', () => {
    const err = Object.assign(new Error('duplicate key (email)=(pat@example.com) already exists'), { code: '23505' });
    logAuthProblem('hub sign-up failed', err);
    expect(lines).toEqual([{ namespace: 'auth', level: 'error', msg: 'hub sign-up failed', meta: { code: '23505' } }]);
    expect(JSON.stringify(lines)).not.toMatch(/pat@example\.com|duplicate/);
  });

  test('a Google refusal keeps only its short error word', () => {
    const err = Object.assign(new Error('bad'), { response: { data: { error: 'invalid_grant', error_description: 'Token for sam@example.com expired' } } });
    expect(authErrorCode(err)).toBe('invalid_grant');
    logAuthProblem('google sign-in failed', err, 'warn');
    expect(lines[0].level).toBe('warn');
    expect(JSON.stringify(lines)).not.toMatch(/sam@example\.com/);
  });

  test('a code that looks like text is dropped', () => {
    expect(authErrorCode({ code: 'user mo@example.com not found' })).toBeNull();
    expect(authErrorCode(new Error('plain'))).toBeNull();
    expect(authErrorCode(undefined)).toBeNull();
  });

  test('the sign-in routes no longer print errors to the console', () => {
    for (const file of ['server/routes/auth.js', 'server/routes/hubAuth.js']) {
      expect(fs.readFileSync(file, 'utf8')).not.toMatch(/console\.(error|warn|log)/);
    }
  });
});
