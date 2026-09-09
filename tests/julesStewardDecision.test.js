import { decideJulesSteward } from '../server/jules-task-sync/decision.js';

const green = {
  prState: { prState: 'open' },
  gate: {
    risk: 'low',
    zoneClean: true,
    forbiddenTouched: false,
    draft: false,
    mergeable: true,
    checksGreen: true,
    localPullSafe: true,
  },
  steward: {},
};

describe('Jules steward decision', () => {
  test('merges when CI is green and GitHub reports no conflict', () => {
    expect(decideJulesSteward(green)).toEqual(expect.objectContaining({
      outcome: 'ready_to_merge',
      reason: expect.objectContaining({ code: 'green_and_mergeable' }),
    }));
  });

  test.each(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED'])(
    'review state %s does not override green CI',
    (reviewState) => {
    expect(decideJulesSteward({
      ...green,
      prState: { prState: 'open', reviewState, reviewAuthor: 'reviewer' },
    }).outcome).toBe('ready_to_merge');
    },
  );

  test.each([
    ['draft PR', { gate: { ...green.gate, draft: true } }, 'blocked'],
    ['merge conflict', { gate: { ...green.gate, mergeable: false } }, 'blocked'],
    ['mergeability pending', { gate: { ...green.gate, mergeable: null } }, 'blocked'],
    ['red checks', { gate: { ...green.gate, checksGreen: false } }, 'blocked'],
    ['pending checks', { gate: { ...green.gate, checksGreen: null } }, 'blocked'],
  ])('%s never becomes merge-ready', (_label, patch, outcome) => {
    expect(decideJulesSteward({ ...green, ...patch }).outcome).toBe(outcome);
  });

  test('risk and scope warnings do not hold a green merge', () => {
    expect(decideJulesSteward({
      ...green,
      gate: {
        ...green.gate,
        risk: 'high',
        zoneClean: false,
        forbiddenTouched: true,
      },
    }).outcome).toBe('ready_to_merge');
  });

  test('repeated merge-ready ticks remain mergeable', () => {
    expect(decideJulesSteward({ ...green, steward: { mergeReady: true } }).outcome).toBe('ready_to_merge');
  });
});
