import { getSessionCookieOptions } from '../server/boot/sessionConfig.js';

describe('session cookie configuration', () => {
  test('allows OAuth state cookies on local production HTTP deployments', () => {
    expect(getSessionCookieOptions('http://localhost:3002')).toMatchObject({
      secure: false,
      sameSite: 'lax',
      httpOnly: true,
    });
  });

  test('keeps secure HTTPS cookies same-site to reduce CSRF exposure', () => {
    expect(getSessionCookieOptions('https://app.example.com')).toMatchObject({
      secure: true,
      sameSite: 'lax',
      httpOnly: true,
    });
  });

  test('requires an explicit HTTPS-only opt-in for cross-site cookies', () => {
    expect(getSessionCookieOptions('https://app.example.com', { crossSite: true }))
      .toMatchObject({ secure: true, sameSite: 'none', httpOnly: true });
    expect(() => getSessionCookieOptions('http://localhost:3002', { crossSite: true }))
      .toThrow('requires an HTTPS APP_ORIGIN');
  });
});
