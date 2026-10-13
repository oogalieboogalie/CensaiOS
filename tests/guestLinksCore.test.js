import {
  createShareToken, hashPasscode, hashShareToken, isShareTokenShape,
  normalizeGuestColor, normalizeGuestName, verifyPasscode,
} from '../server/shareLinks/tokens.js';
import {
  PRIVATE_WINDOW_KINDS, capabilitiesForRole, commentVisibleToLink, projectBoardForLink, usesProjection,
} from '../server/shareLinks/access.js';
import { ShareLinkError, linkIsActive, normalizeLinkInput } from '../server/shareLinks/store.js';
import { parseMentionTokens } from '../server/shareLinks/comments.js';

describe('share link tokens', () => {
  test('tokens carry 256 bits and only their hash is stored', () => {
    const token = createShareToken();
    expect(isShareTokenShape(token)).toBe(true);
    expect(createShareToken()).not.toBe(token);
    expect(hashShareToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashShareToken(token)).not.toContain(token);
    expect(isShareTokenShape('short')).toBe(false);
  });

  test('passcodes are salted and verified in constant time', () => {
    const stored = hashPasscode('rivera');
    expect(stored).toMatch(/^scrypt\$/);
    expect(hashPasscode('rivera')).not.toBe(stored);
    expect(verifyPasscode('rivera', stored)).toBe(true);
    expect(verifyPasscode('Rivera', stored)).toBe(false);
    expect(verifyPasscode('', stored)).toBe(false);
    expect(verifyPasscode('anything', null)).toBe(true);
  });

  test('guest names and colors are cleaned before anyone sees them', () => {
    expect(normalizeGuestName('  Maria \n Rivera\u0007 ')).toBe('Maria Rivera');
    expect(normalizeGuestName('   ')).toBeNull();
    expect(normalizeGuestName('x'.repeat(80))).toHaveLength(40);
    expect(normalizeGuestColor('#4F7CAC')).toBe('#4f7cac');
    expect(normalizeGuestColor('red; background:url(x)')).toBeNull();
  });
});

describe('what a link may see', () => {
  const snapshot = {
    wins: [
      { id: 'brief', kind: 'doc', x: 0, y: 0, w: 10, h: 10, groupId: 'g1', apiKey: 'sk-secret' },
      { id: 'shell', kind: 'terminal', x: 0, y: 0, w: 10, h: 10, groupId: 'g1' },
      { id: 'idea', kind: 'idea', x: 0, y: 0, w: 10, h: 10 },
      { id: 'shown-shell', kind: 'terminal', x: 0, y: 0, w: 10, h: 10, public: true },
      { id: 'nested', kind: 'doc', x: 0, y: 0, w: 10, h: 10, groupId: 'g2' },
    ],
    canvasGroups: [{ id: 'g1' }, { id: 'g2', groupId: 'g1' }, { id: 'g3' }],
    paths: [{ id: 'ink' }],
    links: [{ fromId: 'brief', toId: 'idea' }, { fromId: 'brief', toId: 'shell' }],
  };

  test('private windows never reach a projected guest unless marked public', () => {
    const board = projectBoardForLink(snapshot, { role: 'comment', scope_kind: 'board' });
    expect(board.wins.map((win) => win.id)).toEqual(['brief', 'idea', 'shown-shell', 'nested']);
    expect(board.wins[0].apiKey).toBeUndefined();
    expect(board.links).toEqual([{ fromId: 'brief', toId: 'idea' }]);
    expect(board.paths).toHaveLength(1);
    expect(PRIVATE_WINDOW_KINDS.has('terminal')).toBe(true);
  });

  test('a window link shows one window; a group link includes nested groups', () => {
    expect(projectBoardForLink(snapshot, { scope_kind: 'window', scope_id: 'idea' }).wins.map((w) => w.id)).toEqual(['idea']);
    const group = projectBoardForLink(snapshot, { scope_kind: 'group', scope_id: 'g1' });
    expect(group.wins.map((w) => w.id)).toEqual(['brief', 'nested']);
    expect(group.canvasGroups.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(group.paths).toEqual([]);
  });

  test('stage shows only public windows and no ink', () => {
    const board = projectBoardForLink(snapshot, { scope_kind: 'board', stage: true });
    expect(board.wins.map((w) => w.id)).toEqual(['shown-shell']);
    expect(board.paths).toEqual([]);
  });

  test('only whole-board edit links get the CRDT doc', () => {
    expect(usesProjection({ role: 'edit', scope_kind: 'board', mode: 'link' })).toBe(false);
    expect(usesProjection({ role: 'comment', scope_kind: 'board', mode: 'link' })).toBe(true);
    expect(usesProjection({ role: 'view', scope_kind: 'board', mode: 'live' })).toBe(true);
  });

  test('roles map to capabilities', () => {
    expect(capabilitiesForRole('view')).toMatchObject({ canComment: false, canEdit: false });
    expect(capabilitiesForRole('comment')).toMatchObject({ canComment: true, canEdit: false });
    expect(capabilitiesForRole('edit')).toMatchObject({ canComment: true, canEdit: true });
  });

  test('scoped links only see comments pinned inside their scope', () => {
    const visible = new Set(['idea']);
    expect(commentVisibleToLink({ window_id: 'idea' }, { scope_kind: 'window' }, visible)).toBe(true);
    expect(commentVisibleToLink({ window_id: 'brief' }, { scope_kind: 'window' }, visible)).toBe(false);
    expect(commentVisibleToLink({ window_id: null }, { scope_kind: 'group' }, visible)).toBe(false);
    expect(commentVisibleToLink({ window_id: null }, { scope_kind: 'board' }, visible)).toBe(true);
  });
});

describe('link settings', () => {
  test('edit links are whole-board only', () => {
    expect(() => normalizeLinkInput({ role: 'edit', scopeKind: 'window', scopeId: 'w1' })).toThrow(ShareLinkError);
    expect(() => normalizeLinkInput({ role: 'owner' })).toThrow(/view, comment or edit/);
    expect(() => normalizeLinkInput({ role: 'view', scopeKind: 'group' })).toThrow(/Choose which/);
  });

  test('stream and view links never get an agent budget', () => {
    expect(normalizeLinkInput({ role: 'view', agentBudgetTokens: 5000 }).agentBudgetTokens).toBe(0);
    expect(normalizeLinkInput({ role: 'comment', mode: 'live', agentBudgetTokens: 5000 }).agentBudgetTokens).toBe(0);
    expect(normalizeLinkInput({ role: 'comment', agentBudgetTokens: 5000 }).agentBudgetTokens).toBe(5000);
  });

  test('expiry and passcode are optional and bounded', () => {
    const fields = normalizeLinkInput({ role: 'comment', expiresInHours: 1, passcode: 'abc' });
    expect(fields.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(fields.passcodeHash).toMatch(/^scrypt\$/);
    expect(normalizeLinkInput({ role: 'comment' }).expiresAt).toBeNull();
    expect(() => normalizeLinkInput({ role: 'comment', expiresInHours: 99999 })).toThrow(/Expiry/);
  });

  test('revoked or lapsed links are inactive', () => {
    expect(linkIsActive({ revoked_at: null, expires_at: null })).toBe(true);
    expect(linkIsActive({ revoked_at: new Date() })).toBe(false);
    expect(linkIsActive({ expires_at: new Date(Date.now() - 1000) })).toBe(false);
  });
});

test('mentions are parsed from comment text', () => {
  expect(parseMentionTokens('Hey @Atlas and @maria.r, also email a@b.com')).toEqual(['atlas', 'maria.r']);
});
