import { parseCookieFile, cookiesForPage, siteOf } from '../src/lib/cookieImport.js';

const NETSCAPE = [
  '# Netscape HTTP Cookie File',
  '# This is a generated file! Do not edit.',
  '',
  '.github.com\tTRUE\t/\tTRUE\t2000000000\t_octo\tGH1.1',
  '#HttpOnly_github.com\tFALSE\t/\tTRUE\t2000000000\tuser_session\tsecret\twith-tab',
  'github.com\tFALSE\t/\tTRUE\t1000\told_one\tgone',
  '.google.com\tTRUE\t/\tTRUE\t2000000000\tSID\tnot-for-github',
].join('\r\n');

describe('cookie import', () => {
  it('reads a cookies.txt file, keeping HttpOnly and tabs in values', () => {
    const cookies = parseCookieFile(NETSCAPE);
    expect(cookies).toHaveLength(4);
    expect(cookies[0]).toMatchObject({ name: '_octo', domain: '.github.com', secure: true, httpOnly: false, expires: 2000000000 });
    expect(cookies[1]).toMatchObject({ name: 'user_session', domain: 'github.com', httpOnly: true, value: 'secret\twith-tab' });
  });

  it('reads cookie editor JSON exports', () => {
    const json = JSON.stringify([
      { name: 'sid', value: 'x', domain: 'app.example.com', hostOnly: false, path: '/', secure: true, httpOnly: true, sameSite: 'no_restriction', expirationDate: 2000000000.5 },
      { name: 'bad' },
    ]);
    const cookies = parseCookieFile(json);
    expect(cookies).toEqual([
      { name: 'sid', value: 'x', domain: '.app.example.com', path: '/', expires: 2000000000, secure: true, httpOnly: true, sameSite: 'none' },
    ]);
  });

  it('keeps only live cookies for the site on screen', () => {
    const picked = cookiesForPage(parseCookieFile(NETSCAPE), 'https://github.com/login', 1_700_000_000_000);
    expect(picked.map((c) => c.name)).toEqual(['_octo', 'user_session']);
  });

  it('matches subdomains of the same site', () => {
    const cookies = [{ name: 'a', domain: '.example.co.uk' }, { name: 'b', domain: 'other.co.uk' }];
    expect(cookiesForPage(cookies, 'https://shop.example.co.uk/').map((c) => c.name)).toEqual(['a']);
    expect(siteOf('accounts.google.com')).toBe('google.com');
    expect(siteOf('shop.example.co.uk')).toBe('example.co.uk');
  });

  it('returns nothing for junk', () => {
    expect(parseCookieFile('hello')).toEqual([]);
    expect(parseCookieFile('{not json')).toEqual([]);
    expect(cookiesForPage([{ name: 'a', domain: 'x.com' }], 'not a url')).toEqual([]);
  });
});
