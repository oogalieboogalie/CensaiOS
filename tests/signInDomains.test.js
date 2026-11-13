// Who can sign up: an admin lets in whole email domains (Settings, Sharing),
// on top of the people named in ALLOWED_USERS. Domains only ever add people.
import { isSessionAuthorized, resolveUserAccess } from '../server/security/authPolicy.js';
import { __test__, emailDomain, normalizeDomain } from '../server/signInDomains/store.js';

afterEach(() => __test__.setCurrent([]));

describe('normalizeDomain', () => {
  test.each([
    ['censai.app', 'censai.app'],
    ['  @Censai.App ', 'censai.app'],
    ['someone@censai.app', 'censai.app'],
    ['eu.censai.app.', 'eu.censai.app'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });

  test.each(['', 'censai', 'censai app', 'http://censai.app', '-bad.com', 'a..b.com'])('refuses %p', (input) => {
    expect(() => normalizeDomain(input)).toThrow(/domain like censai\.app/);
  });

  test('refuses mail anyone can get, which would open sign-up to everyone', () => {
    expect(() => normalizeDomain('Gmail.com')).toThrow(/let everyone sign up/);
    expect(() => normalizeDomain('x@outlook.com')).toThrow(/let everyone sign up/);
  });
});

test('emailDomain takes the part after the last @', () => {
  expect(emailDomain(' Pat@Censai.App ')).toBe('censai.app');
  expect(emailDomain('no-at-sign')).toBe('');
});

describe('a private server with ALLOWED_USERS', () => {
  const env = { ALLOWED_USERS: 'owner@censai.app', CENSAI_ADMIN_EMAILS: 'owner@censai.app' };
  const base = { runtimeMode: 'private_server', env };

  test('an email at an allowed domain may sign up, as a user', () => {
    expect(resolveUserAccess({ ...base, email: 'pat@censai.app', allowedDomains: ['censai.app'] }))
      .toMatchObject({ allowed: true, role: 'user' });
  });

  test('other domains and look-alike subdomains still need an invite', () => {
    for (const email of ['pat@example.com', 'pat@eu.censai.app', 'pat@censai.app.evil.com']) {
      expect(resolveUserAccess({ ...base, email, allowedDomains: ['censai.app'] }))
        .toEqual({ allowed: false, reason: 'invite_required' });
    }
  });

  test('with no domains, only the named people get in (unchanged)', () => {
    expect(resolveUserAccess({ ...base, email: 'pat@censai.app' })).toEqual({ allowed: false, reason: 'invite_required' });
    expect(resolveUserAccess({ ...base, email: 'owner@censai.app' })).toMatchObject({ allowed: true, role: 'admin' });
  });

  test('the list in memory is what sessions are checked against', () => {
    const session = { userId: 2, userEmail: 'pat@censai.app' };
    expect(isSessionAuthorized(session, base)).toBe(false);
    __test__.setCurrent(['censai.app']);
    expect(isSessionAuthorized(session, base)).toBe(true);
    __test__.setCurrent([]);
    expect(isSessionAuthorized(session, base)).toBe(false);
  });
});

test('on the desktop board, a domain adds to ALLOWED_USERS and never narrows an open board', () => {
  const local = { runtimeMode: 'local_desktop', userCount: 3 };
  expect(resolveUserAccess({ ...local, env: {}, email: 'friend@example.com', allowedDomains: ['censai.app'] }))
    .toMatchObject({ allowed: true });
  expect(resolveUserAccess({ ...local, env: { ALLOWED_USERS: 'owner@censai.app' }, email: 'pat@censai.app', allowedDomains: ['censai.app'] }))
    .toMatchObject({ allowed: true, role: 'user' });
});
