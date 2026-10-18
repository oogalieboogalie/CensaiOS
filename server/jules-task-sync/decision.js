function reason(code, detail) {
  return { code, detail };
}

export function decideJulesSteward(input = {}) {
  const pr = input.prState || {};
  const gate = input.gate || {};
  const prState = String(pr.prState || '').toLowerCase();

  if (prState === 'merged' || pr.mergedAt) {
    return { outcome: 'noop', reason: reason('already_merged', 'GitHub reports the PR as merged.') };
  }
  if (prState && prState !== 'open') {
    return { outcome: 'blocked', reason: reason('pr_not_open', `PR state is ${prState}.`) };
  }
  if (gate.draft) {
    return { outcome: 'blocked', reason: reason('draft_pr', 'The PR is still a draft.') };
  }
  if (gate.mergeable !== true) {
    return {
      outcome: 'blocked',
      reason: reason(gate.mergeable === false ? 'merge_conflict' : 'mergeability_pending',
        gate.mergeable === false ? 'GitHub reports merge conflicts.' : 'GitHub has not confirmed mergeability.'),
    };
  }
  // Diagram 01: the review's verdict decides the merge. A "no" sends the PR
  // back to Jules for a fix (the runner asks); nobody reviewing yet holds nothing.
  if (gate.review === 'fail') {
    return { outcome: 'needs_fix', reason: reason('review_said_no', gate.reviewReasons?.join(' ') || 'The review turned the PR down.') };
  }
  if (gate.checksGreen === false) {
    return { outcome: 'blocked', reason: reason('checks_red', 'Required checks are not green.') };
  }
  if (gate.checksGreen !== true) {
    return { outcome: 'blocked', reason: reason('checks_pending', 'Required checks have not completed successfully.') };
  }
  return {
    outcome: 'ready_to_merge',
    reason: reason('green_and_mergeable', 'CI is green and GitHub reports no merge conflict.'),
  };
}
