// tests/friendCodes.test.js
//
// The two codes friends pass to each other: a friend code (who someone is)
// and a party code (where one board is shared right now).

import { CodeError, kindOfCode, makeFriendCode, makePartyCode, partyHost, plainKey, readFriendCode, readPartyCode } from '../server/friends/codes.js';

const KEY = 'ab'.repeat(32);
const ADDRESS = `tc${'A1b2C3d4_-'.repeat(4)}`;

describe('a friend code', () => {
  test('carries a name and the public half of an identity, and reads back the same', () => {
    const code = makeFriendCode({ name: '  Alma   Example ', key: `nodekey:${KEY.toUpperCase()}` });
    expect(code.startsWith('cf1-')).toBe(true);
    expect(readFriendCode(`  ${code}\n`)).toEqual({ name: 'Alma Example', key: KEY });
    expect(kindOfCode(code)).toBe('friend');
  });

  test('holds nothing but the name and the public key', () => {
    const code = makeFriendCode({ name: 'Alma', key: KEY });
    const body = Buffer.from(code.slice(4, -7), 'base64url');
    expect(body.subarray(0, 32).toString('hex')).toBe(KEY);
    expect(body.subarray(32).toString('utf8')).toBe('Alma');
    // Short enough to text: the key, the name, and little else.
    expect(code.length).toBeLessThan(64);
  });

  test('a name in any alphabet survives the trip, and a missing one reads as "Someone"', () => {
    expect(readFriendCode(makeFriendCode({ name: 'Zoë 山田', key: KEY }))).toEqual({ name: 'Zoë 山田', key: KEY });
    expect(readFriendCode(makeFriendCode({ name: '', key: KEY })).name).toBe('Someone');
  });

  test('a code cut off or changed on the way is caught before anything is tried', () => {
    const code = makeFriendCode({ name: 'Alma', key: KEY });
    const changed = code.replace(/.(?=-[0-9a-f]{6}$)/, (ch) => (ch === 'A' ? 'B' : 'A'));
    for (const bad of [code.slice(0, -3), code.slice(0, 30), changed, '', 'hello', 'cf1-!!!-000000', `${code}${'x'.repeat(2000)}`]) {
      expect(() => readFriendCode(bad)).toThrow(/not complete/);
    }
  });

  test('a name can\'t carry line breaks or run on forever', () => {
    const { name } = readFriendCode(makeFriendCode({ name: `Al\u0007ma\n${'x'.repeat(200)}`, key: KEY }));
    expect(name).toBe(`Al ma ${'x'.repeat(34)}`);
  });

  test('a party code pasted where a friend code goes says so', () => {
    const party = makePartyCode({ address: ADDRESS, hostName: 'Alma', boardName: 'Family board', boardId: 'board-a' });
    expect(() => readFriendCode(party)).toThrow(CodeError);
    expect(() => readFriendCode(party)).toThrow('That is not a friend code.');
  });

  test('only a 64-character key counts as a key', () => {
    expect(plainKey(KEY)).toBe(KEY);
    for (const bad of ['', 'abc', `${KEY}0`, KEY.replace('a', 'g'), null, undefined]) expect(plainKey(bad)).toBe('');
    expect(() => makeFriendCode({ name: 'Alma', key: 'nope' })).toThrow('no identity yet');
  });
});

describe('a party code', () => {
  test('carries the address, who is sharing and which board', () => {
    const token = 'p'.repeat(32);
    const label = 'p-0123456789ab';
    const code = makePartyCode({ address: ADDRESS, hostName: 'Alma', hostKey: KEY, boardName: 'Family board', boardId: 'board-a', token, label });
    expect(code.startsWith('cp1-')).toBe(true);
    expect(readPartyCode(code)).toEqual({ address: ADDRESS, hostName: 'Alma', hostKey: KEY, boardName: 'Family board', boardId: 'board-a', token, label });
    // A code that does not say who is sharing reads as from nobody, and one
    // with an odd password reads as having none.
    const bare = readPartyCode(makePartyCode({ address: ADDRESS, hostName: 'Alma', boardName: 'B', boardId: 'b', token: 'short' }));
    expect(bare).toMatchObject({ hostKey: '', token: '', label: '' });
    expect(kindOfCode(code)).toBe('party');
    expect(kindOfCode('something else')).toBe('');
  });

  test('the name a shared board opens under is a made-up one, never one a code could choose', () => {
    expect(partyHost('p-0123456789ab')).toBe('p-0123456789ab.localhost');
    // A code can't steer the browser to an address that shares sign-ins with
    // the friend's own censaiOS, or to anywhere else.
    for (const bad of ['', 'localhost', '127.0.0.1', 'p-0123456789ab.evil.example', 'p-0123456789AB', 'p-0123456789abc', 'x-0123456789ab', null]) {
      expect(partyHost(bad)).toBe('');
      const code = makePartyCode({ address: ADDRESS, hostName: 'Alma', boardName: 'B', boardId: 'b', label: bad });
      expect(readPartyCode(code).label).toBe('');
    }
  });

  test('can\'t be made before sharing has an address, and a made-up address is refused', () => {
    expect(() => makePartyCode({ address: '', hostName: 'Alma', boardName: 'B', boardId: 'b' })).toThrow('not started');
    const forged = (data) => {
      const good = makePartyCode({ address: ADDRESS, hostName: 'Alma', boardName: 'B', boardId: 'b' });
      // A well-formed code whose insides were swapped fails its check.
      const body = Buffer.from(JSON.stringify(data)).toString('base64url');
      return good.replace(/^cp1-[^-]+/, `cp1-${body}`);
    };
    expect(() => readPartyCode(forged({ a: 'http://evil.example', h: 'x', b: 'y', w: 'z' }))).toThrow(/not complete/);
  });

  test('a board id with odd characters is dropped, not passed on', () => {
    const code = makePartyCode({ address: ADDRESS, hostName: 'Alma', boardName: 'B', boardId: '../../etc' });
    expect(readPartyCode(code).boardId).toBe('');
  });
});
