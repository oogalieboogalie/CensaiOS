// The review decides the merge (Alex's diagram 01): a Jules PR merges only
// when its review says OK. Reads the PR's reviews from GitHub: the AI
// reviewers (scripts/ai-review.mjs, marked <!-- ai-review:<provider> -->)
// say no when their latest review found a high-severity bug; a person says
// no with "Request changes". Pure: the overnight runner and tests use it.

export const MAX_REPAIR_ROUNDS = 3;

const AI_MARK = /<!-- ai-review:([a-z]+) diff:[0-9a-f]+ -->/;
const AI_NAMES = { claude: 'Claude review', openai: 'ChatGPT review' };

function highCount(body) {
  const counts = String(body || '').match(/\*\*\d+ possible bugs?\*\* \(([^)]*)\)/);
  const high = counts?.[1].match(/(\d+) high/);
  return high ? Number(high[1]) : 0;
}

/**
 * { verdict: 'pass' | 'fail' | 'none', reasons: [plain lines], reviewers }.
 * Only each reviewer's latest review counts. 'none' means nobody reviewed
 * yet, which does not hold the merge (the AI reviewers skip docs-only PRs).
 */
export function readReviewVerdict(reviews = []) {
  const latest = new Map();
  for (const review of Array.isArray(reviews) ? reviews : []) {
    const ai = String(review?.body || '').match(AI_MARK);
    if (ai) {
      latest.set(`ai:${ai[1]}`, { name: AI_NAMES[ai[1]] || `${ai[1]} review`, high: highCount(review.body) });
    } else if (['APPROVED', 'CHANGES_REQUESTED'].includes(review?.state)) {
      const who = review.user?.login || 'A reviewer';
      latest.set(`person:${who}`, { name: who, changesRequested: review.state === 'CHANGES_REQUESTED' });
    }
  }
  const reviewers = [...latest.values()];
  const reasons = reviewers.flatMap((r) => {
    if (r.high > 0) return [`${r.name} found ${r.high} high-severity bug${r.high === 1 ? '' : 's'}.`];
    if (r.changesRequested) return [`${r.name} asked for changes.`];
    return [];
  });
  return { verdict: reviewers.length === 0 ? 'none' : reasons.length ? 'fail' : 'pass', reasons, reviewers: reviewers.map((r) => r.name) };
}

/** What Jules is asked when the review says no. */
export function repairPrompt(prNumber, reasons) {
  return [
    `The review turned down your pull request #${prNumber}:`,
    ...reasons.map((line) => `- ${line}`),
    'Read the review comments on the PR, fix every high-severity finding and every requested change on the same branch, and push.',
    'Do not open a new PR.',
  ].join('\n');
}

/**
 * What the runner does about a "no" for this head commit. Asks Jules once per
 * commit; after MAX_REPAIR_ROUNDS asks the task is parked for a person.
 * Returns { action: 'ask' | 'wait' | 'park', rounds }.
 */
export function planReviewRepair(item = {}, headSha) {
  const rounds = Number(item.repairRounds) || 0;
  if (item.repairAskedFor === headSha) return { action: 'wait', rounds };
  if (rounds >= MAX_REPAIR_ROUNDS) return { action: 'park', rounds };
  return { action: 'ask', rounds: rounds + 1 };
}
