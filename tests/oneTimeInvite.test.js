import { describe, expect, test } from '@jest/globals';
import { inviteLinkInput, ONE_TIME_LOOK_HOURS, ONE_TIME_LOOK_LABEL, oneTimeLinkUsed } from '../server/shareLinks/oneTimeInvite.js';

describe('an invite with no account', () => {
  test('is a look-only link that runs out after 7 days, even if edit was asked for', () => {
    expect(inviteLinkInput({ oneTime: true, role: 'edit', expiresInHours: '', agentBudgetTokens: 5000 })).toEqual({
      role: 'view',
      scopeKind: 'board',
      scopeId: null,
      mode: 'link',
      stage: false,
      label: ONE_TIME_LOOK_LABEL,
      expiresInHours: ONE_TIME_LOOK_HOURS,
      agentBudgetTokens: 0,
      passcode: '',
    });
    expect(ONE_TIME_LOOK_HOURS).toBe(7 * 24);
    expect(inviteLinkInput({ role: 'edit' })).toEqual({ role: 'edit' });
  });

  test('works once: a second person cannot join, and an ordinary link still can', async () => {
    const db = { query: async () => ({ rows: [{ '?column?': 1 }] }) };
    expect(await oneTimeLinkUsed(db, { id: 'link-1', label: ONE_TIME_LOOK_LABEL })).toBe(true);
    expect(await oneTimeLinkUsed({ query: async () => ({ rows: [] }) }, { id: 'link-1', label: ONE_TIME_LOOK_LABEL })).toBe(false);
    let queried = false;
    expect(await oneTimeLinkUsed({ query: async () => { queried = true; return { rows: [{ n: 1 }] }; } }, { id: 'link-2', label: 'Can edit' })).toBe(false);
    expect(queried).toBe(false);
  });
});
