import { describe, expect, jest, test } from '@jest/globals';
import { MAX_REPAIR_ROUNDS, planReviewRepair, readReviewVerdict, repairPrompt } from '../server/jules-task-sync/reviewVerdict.js';
import { decideJulesSteward } from '../server/jules-task-sync/decision.js';
import { handleReviewNo } from '../server/jules-task-sync/reviewRepair.js';

// Diagram 01: the review's verdict decides each Jules merge.
const ai = (provider, counts) => ({
  state: 'COMMENTED',
  body: `## Review\n\nsummary\n\n${counts ? `**3 possible bugs** (${counts}).` : '**No real bugs found.**'}\n<!-- ai-review:${provider} diff:abc123 -->`,
});
const person = (login, state) => ({ state, user: { login }, body: '' });
const green = { prState: { prState: 'open' }, gate: { draft: false, mergeable: true, checksGreen: true } };

describe('reading the review', () => {
  test('no reviews yet holds nothing', () => {
    expect(readReviewVerdict([])).toEqual({ verdict: 'none', reasons: [], reviewers: [] });
  });

  test('a high-severity finding is a no; medium and low are not', () => {
    expect(readReviewVerdict([ai('claude', '1 high, 2 low')])).toMatchObject({
      verdict: 'fail', reasons: ['Claude review found 1 high-severity bug.'],
    });
    expect(readReviewVerdict([ai('openai', '2 medium, 1 low')]).verdict).toBe('pass');
  });

  test('only each reviewer\'s latest review counts', () => {
    expect(readReviewVerdict([ai('claude', '2 high'), ai('claude', null)]).verdict).toBe('pass');
    expect(readReviewVerdict([ai('claude', null), ai('openai', '1 high, 1 low')]).reasons).toEqual(['ChatGPT review found 1 high-severity bug.']);
  });

  test('a person asking for changes is a no until they approve', () => {
    expect(readReviewVerdict([person('jordan', 'CHANGES_REQUESTED')]).reasons).toEqual(['jordan asked for changes.']);
    expect(readReviewVerdict([person('jordan', 'CHANGES_REQUESTED'), person('jordan', 'APPROVED')]).verdict).toBe('pass');
    expect(readReviewVerdict([person('jordan', 'COMMENTED')]).verdict).toBe('none');
  });
});

describe('the merge decision', () => {
  test('a review no sends the PR back for a fix, even with green CI', () => {
    const decision = decideJulesSteward({ ...green, gate: { ...green.gate, review: 'fail', reviewReasons: ['Claude review found 1 high-severity bug.'] } });
    expect(decision).toEqual({ outcome: 'needs_fix', reason: { code: 'review_said_no', detail: 'Claude review found 1 high-severity bug.' } });
  });

  test('a review pass or no review keeps the green merge', () => {
    expect(decideJulesSteward({ ...green, gate: { ...green.gate, review: 'pass' } }).outcome).toBe('ready_to_merge');
    expect(decideJulesSteward({ ...green, gate: { ...green.gate, review: 'none' } }).outcome).toBe('ready_to_merge');
  });
});

describe('asking Jules for the fix', () => {
  test('once per commit, then park after the last round', () => {
    expect(planReviewRepair({}, 'sha1')).toEqual({ action: 'ask', rounds: 1 });
    expect(planReviewRepair({ repairAskedFor: 'sha1', repairRounds: 1 }, 'sha1')).toEqual({ action: 'wait', rounds: 1 });
    expect(planReviewRepair({ repairAskedFor: 'sha1', repairRounds: 1 }, 'sha2')).toEqual({ action: 'ask', rounds: 2 });
    expect(planReviewRepair({ repairAskedFor: 'sha3', repairRounds: MAX_REPAIR_ROUNDS }, 'sha4').action).toBe('park');
  });

  test('the runner comments on the PR, messages Jules, and remembers the commit', async () => {
    const comment = jest.fn(async () => ({}));
    const sendSessionMessage = jest.fn(async () => ({}));
    const block = jest.fn();
    const item = { session: 'sessions/42' };
    const review = { reasons: ['Claude review found 1 high-severity bug.'] };
    const args = { queue: { repo: 'o/r' }, item, pr: { number: 7, head: { sha: 'sha1' } }, review, keys: { github: 'g', jules: 'j' }, block, log: () => {}, sendSessionMessage, comment };

    await handleReviewNo(args);
    expect(comment.mock.calls[0][3]).toMatch(/Not merging yet: the review said no/);
    expect(sendSessionMessage).toHaveBeenCalledWith('j', 'sessions/42', repairPrompt(7, review.reasons));
    expect(item).toMatchObject({ repairAskedFor: 'sha1', repairRounds: 1, reviewNote: expect.stringMatching(/round 1 of 3/) });

    await handleReviewNo(args); // same commit: wait, no second ask
    expect(sendSessionMessage).toHaveBeenCalledTimes(1);
    expect(block).not.toHaveBeenCalled();
  });

  test('the fix request names the PR and every reason', () => {
    const text = repairPrompt(7, ['A.', 'B.']);
    expect(text).toMatch(/#7/);
    expect(text).toMatch(/- A\.\n- B\./);
    expect(text).toMatch(/Do not open a new PR/);
  });
});
