// Social canvas: profile keys, profile addresses, signed feeds, the words
// the feed uses, and board activity read from the canvas update log.
// Pure code and fakes, no database.
import * as Y from 'yjs';
import { generateIdentity, identitySigner } from '../server/agentNetwork/installIdentity.js';
import { canonicalJson } from '../server/agentNetwork/canonical.js';
import { createProfileKey, hashProfileKey, isProfileKeyShape } from '../server/social/keys.js';
import { FEED_KIND, parseProfileAddress, verifyFeed } from '../server/social/remote.js';
import { describeTools } from '../server/social/agentNotes.js';
import { boardActivity, describeBuild } from '../server/social/activity.js';
import { upsertWindowInDoc } from '../server/collab/serverWriter.js';

const PROFILE = '5fff44d6-bf7c-44a2-9076-1e7f1f2bca48';

function signedFeed(signer, extra = {}) {
  const body = {
    kind: FEED_KIND, v: 1, at: '2026-10-12T06:00:00.000Z',
    profile: { id: PROFILE, name: 'Alma', bio: '' }, boards: [], items: [],
    signer: { install: signer.installId, publicKey: signer.publicKey }, ...extra,
  };
  return { body, signature: signer.sign(canonicalJson(body)) };
}

describe('profile keys', () => {
  test('keys are csk_ plus 256 random bits, and only the hash is compared', () => {
    const key = createProfileKey();
    expect(isProfileKeyShape(key)).toBe(true);
    expect(isProfileKeyShape('cak_' + key.slice(4))).toBe(false);
    expect(createProfileKey()).not.toBe(key);
    expect(hashProfileKey(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashProfileKey(key)).not.toContain(key.slice(4, 20));
  });
});

describe('profile addresses', () => {
  test('a profile address names a host and a profile id', () => {
    expect(parseProfileAddress(`https://abc.trycloudflare.com/api/social/v1/profiles/${PROFILE.toUpperCase()}/`)).toEqual({
      origin: 'https://abc.trycloudflare.com', profileId: PROFILE, url: `https://abc.trycloudflare.com/api/social/v1/profiles/${PROFILE}`,
    });
  });

  test('anything else is refused in plain words', () => {
    expect(() => parseProfileAddress('not a url')).toThrow(/not a web address/);
    expect(() => parseProfileAddress(`ftp://x/api/social/v1/profiles/${PROFILE}`)).toThrow(/https/);
    expect(() => parseProfileAddress(`https://u:p@x/api/social/v1/profiles/${PROFILE}`)).toThrow(/https/);
    expect(() => parseProfileAddress('https://x/api/mcp/agents/abc')).toThrow(/not a censaiOS profile/);
  });
});

describe('signed feeds', () => {
  const alma = identitySigner(generateIdentity());
  const sam = identitySigner(generateIdentity());

  test('a feed signed by its install checks out', () => {
    expect(verifyFeed(signedFeed(alma))).toEqual({ ok: true, installId: alma.installId });
  });

  test('a changed feed, a borrowed install id or a different kind does not', () => {
    const tampered = signedFeed(alma);
    tampered.body.items = [{ id: 'post:1', text: 'not what Alma said' }];
    expect(verifyFeed(tampered).ok).toBe(false);
    const borrowed = signedFeed(sam);
    borrowed.body.signer.install = alma.installId;
    expect(verifyFeed(borrowed).ok).toBe(false);
    expect(verifyFeed(signedFeed(alma, { kind: 'censai.agent-receipt' })).ok).toBe(false);
    expect(verifyFeed(null).ok).toBe(false);
  });
});

describe('feed words', () => {
  test('agent tools read as plain words and private ones are left out', () => {
    expect(describeTools([{ tool: 'web_search' }, { tool: 'canvas_spawn_window' }])).toBe('searched the web and opened a window');
    expect(describeTools([{ tool: 'journal' }, { tool: 'read_journal_search' }, { tool: 'get_secret_key' }])).toBe('');
    expect(describeTools([{ tool: 'a' }, { tool: 'b' }, { tool: 'c' }, { tool: 'd' }, { tool: 'a' }])).toBe('a, b, c and 1 more');
    expect(describeTools([{ tool: 'mcp__github__list_issues' }])).toBe('list issues');
  });

  test('a board change becomes one line, or nothing', () => {
    const none = { added: [], removed: [], moved: 3, edited: 0, inkAdded: 0 };
    expect(describeBuild(none)).toBeNull();
    expect(describeBuild({ ...none, added: ['PDF'] })).toBe('added PDF');
    expect(describeBuild({ ...none, added: ['PDF', 'Notes'], edited: 2, inkAdded: 1 })).toBe('added PDF and Notes, worked on 2 windows, drew on it');
    expect(describeBuild({ ...none, added: ['A', 'B', 'C', 'D', 'E'] })).toBe('added A, B, C and 2 more');
  });
});

describe('board activity', () => {
  function logOf(steps) {
    const doc = new Y.Doc();
    const rows = [];
    doc.on('update', (update) => rows.push({ update }));
    let seq = 0;
    for (const { actor, at, win } of steps) {
      upsertWindowInDoc(doc, win);
      Object.assign(rows.at(-1), { seq: ++seq, actor, createdAt: at });
    }
    return { entries: async () => ({ baseUpdate: null, compactedSeq: 0, rows }) };
  }
  const db = { query: async () => ({ rows: [{ id: 7, name: 'Alma' }] }) };
  const now = Date.parse('2026-10-12T06:00:00Z');
  const box = { x: 0, y: 0, w: 300, h: 200 };

  test('people building show up by name; private windows and agents do not', async () => {
    const updateLog = logOf([
      { actor: 'user:7', at: now - 60_000, win: { ...box, id: 'a', kind: 'doc', title: 'Landing page copy' } },
      { actor: 'user:7', at: now - 50_000, win: { ...box, id: 't', kind: 'terminal', title: 'Terminal' } },
      { actor: 'user:7', at: now - 40_000, win: { ...box, id: 's', kind: 'social', title: 'Social' } },
      { actor: 'server', at: now - 30_000, win: { ...box, id: 'b', kind: 'doc', title: 'Agent doc' } },
    ]);
    const items = await boardActivity(db, 'ws-1', { updateLog, now });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ who: { kind: 'person', userId: 7, name: 'Alma' }, text: 'added Landing page copy' });
    expect(JSON.stringify(items)).not.toMatch(/Terminal|Social|Agent doc/);
  });

  test('old changes and a missing log give an empty list', async () => {
    const updateLog = logOf([{ actor: 'user:7', at: now - 30 * 24 * 3600_000, win: { ...box, id: 'a', kind: 'doc', title: 'Old' } }]);
    expect(await boardActivity(db, 'ws-1', { updateLog, now })).toEqual([]);
    expect(await boardActivity(db, 'ws-1', { updateLog: { entries: async () => { throw new Error('gone'); } }, now })).toEqual([]);
  });
});
