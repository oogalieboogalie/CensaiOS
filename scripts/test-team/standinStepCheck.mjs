// The stand-in model's read-over for Step cards: when censaiOS asks it to
// judge a step's sentences against the helper's report, every sentence
// passes when the report says "Made-up: done" and fails otherwise, so a
// tester can tick a step without a real model.

export const STEP_DONE = 'Made-up: done';
const REVIEW_START = 'You are Censai, checking a step of work';

/** Returns { content } for a step read-over, or null for anything else. */
export function stepCheckReply(messages = []) {
  if (!String(messages[0]?.content || '').startsWith(REVIEW_START)) return null;
  const body = String(messages[1]?.content || '');
  const count = (body.split('Sentences to judge:')[1] || '').split("The helper's report:")[0].match(/^\d+\. /gm)?.length || 1;
  const pass = body.includes(STEP_DONE);
  return { content: Array.from({ length: count }, (_, i) => `${i + 1}. ${pass ? 'PASS The helper says it is done.' : 'FAIL The report does not show it yet.'}`).join('\n') };
}
