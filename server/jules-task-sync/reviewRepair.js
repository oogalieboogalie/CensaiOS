// What the overnight runner does when the review says no (Alex's diagram 01):
// say why on the PR, ask Jules to fix it on the same branch, and wait for the
// new push. After MAX_REPAIR_ROUNDS asks the task is parked for a person.
// The GitHub comment and Jules message calls are passed in (scripts/lib clients).
import { MAX_REPAIR_ROUNDS, planReviewRepair, repairPrompt } from './reviewVerdict.js';

export async function handleReviewNo({ queue, item, pr, review, keys, block, log, sendSessionMessage, comment }) {
  const plan = planReviewRepair(item, pr.head.sha);
  if (plan.action === 'wait') {
    item.reviewNote = `Review said no; Jules was asked to fix it (round ${plan.rounds} of ${MAX_REPAIR_ROUNDS}).`;
    log(`WAITING PR #${pr.number}: Jules is fixing the review findings`);
    return plan;
  }
  if (plan.action === 'park') {
    block(queue, item, 'review_still_failing', `The review still says no after ${MAX_REPAIR_ROUNDS} fix rounds: ${review.reasons.join(' ')}`);
    log(`PARKED PR #${pr.number}: review still failing after ${MAX_REPAIR_ROUNDS} rounds`);
    return plan;
  }
  const body = [
    `**Not merging yet: the review said no** (fix round ${plan.rounds} of ${MAX_REPAIR_ROUNDS}).`,
    '',
    ...review.reasons.map((line) => `- ${line}`),
    '',
    'Jules has been asked to fix these on this branch. The overnight runner merges once the review passes and CI is green.',
  ].join('\n');
  await comment(keys.github, queue.repo, pr.number, body);
  await sendSessionMessage(keys.jules, item.session, repairPrompt(pr.number, review.reasons));
  Object.assign(item, {
    repairAskedFor: pr.head.sha,
    repairRounds: plan.rounds,
    reviewNote: `Review said no; Jules was asked to fix it (round ${plan.rounds} of ${MAX_REPAIR_ROUNDS}).`,
  });
  log(`FIX ASKED PR #${pr.number} (round ${plan.rounds}): ${review.reasons.join(' ')}`);
  return plan;
}
