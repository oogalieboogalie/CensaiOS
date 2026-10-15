// The optional judge: one more model, run on the person's own key, reads
// every answer (names hidden, so it cannot favour its own family) and says
// which one is best. Off unless the person picks a judge. Answers cut off
// at their length limit are left out.
import { CUT_OFF_REASONS } from './arenaCatalog.js';

const ANSWER_LIMIT = 6_000;

export const JUDGE_SYSTEM = 'You are a strict, fair judge comparing answers to the same request. '
  + 'Judge correctness first, then completeness, then clarity. Ignore length and style unless the request asks for them. '
  + 'Reply with JSON only: {"best": <answer number>, "reason": "<one short sentence>"}';

/** The request sent to the judge. Only finished answers are shown. */
export function judgeRequest({ prompt, system, results, check = '' }) {
  const answers = results
    .map((result, index) => ({ index, result }))
    .filter(({ result }) => result?.status === 'done' && !CUT_OFF_REASONS.has(result.finishReason) && String(result.text || '').trim());
  const body = answers
    .map(({ index, result }) => `### Answer ${index + 1}\n${String(result.text).slice(0, ANSWER_LIMIT)}`)
    .join('\n\n');
  const instructions = system ? `Instructions the answerers were given:\n${system}\n\n` : '';
  const reference = check ? `\n\nWhat a right answer looks like:\n${check}` : '';
  return {
    system: JUDGE_SYSTEM,
    prompt: `${instructions}The request:\n${prompt}${reference}\n\n${body}\n\nWhich answer is best?`,
    answerCount: answers.length,
  };
}

/** Reads the judge's reply. Returns { best (0-based), reason } or null. */
export function parseJudgeReply(text, laneCount) {
  const raw = String(text || '');
  const json = raw.match(/\{[\s\S]*\}/);
  let best = null;
  let reason = '';
  if (json) {
    try {
      const data = JSON.parse(json[0]);
      best = Number(data.best);
      reason = String(data.reason || '');
    } catch { /* fall back to reading the words */ }
  }
  if (!Number.isInteger(best)) {
    const words = raw.match(/answer\s*#?\s*(\d+)/i);
    best = words ? Number(words[1]) : null;
  }
  if (!Number.isInteger(best) || best < 1 || best > laneCount) return null;
  return { best: best - 1, reason: reason.slice(0, 400) };
}
