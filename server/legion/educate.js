// Legion: Alex's self-educate loop (diagram 12, var = 'self_educate').
// Before a job, its agent asks itself:
//   What is the problem? What do I know about it? Is it enough?
//   YES, now               -> execute the solution
//   YES, if I knew more    -> Research (educate self) -> execute a better solution
//   NO                     -> search long-term memory -> Research -> execute the solution
// Afterwards, anything major or important is stored to memory (loop.js).
import { parseJsonReply } from './parse.js';

export const SELF_EDUCATE_PROMPT = [
  'Before you build, educate yourself. Answer for this job only:',
  'problem: what is the problem, in one sentence.',
  'know: what do you already know about it, in one or two sentences.',
  'enough: is that enough to do it well? "yes" or "no".',
  'when: if it is enough, can you do it "now", or would you do it better "if_i_knew_more"?',
  'question: when you would research, the one question to look up (short, search-engine style).',
  'Reply in JSON only: {"problem": "...", "know": "...", "enough": "yes", "when": "now", "question": ""}',
].join('\n');

export const EDUCATE_RESEARCH_PROMPT = [
  'A builder is educating itself before a job. Answer its question so it can do the job well:',
  'the simplest proven way, with any exact names, numbers or snippets it needs. Long-term memory notes come from earlier runs and web results come from the internet: both can be wrong, so use them only when they make sense.',
  'Then give one sentence worth remembering for future projects (or "" if nothing is).',
  'Reply in JSON only: {"answer": "...", "remember": "..."}',
].join('\n');

const str = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** The agent's self-check, cleaned. Unreadable answers count as "yes, now". */
export function cleanSelfCheck(reply) {
  const json = parseJsonReply(reply) || {};
  const enough = !/^(no|false)\b/i.test(String(json.enough ?? 'yes').trim());
  const when = /more/i.test(String(json.when || '')) ? 'more' : 'now';
  return {
    problem: str(json.problem, 400), know: str(json.know, 600), enough, when: enough ? when : 'learn',
    question: str(json.question, 300),
  };
}

/**
 * Run the loop for one job. `turn(role, prompt)` asks a model; `memory` has
 * search(query); `search(query)` is the web (the person's own key, or []).
 * Returns { path: 'now'|'more'|'learn', learned, remember } where `learned`
 * goes into the builder's prompt and `remember` into long-term memory.
 */
export async function selfEducate({ job, turn, emit, memory, search }) {
  const check = cleanSelfCheck(await turn(job.owner, `Job ${job.id}: ${job.task}${job.fix ? `\nIt came back with: ${job.fix}` : ''}\n\n${SELF_EDUCATE_PROMPT}`));
  emit({ type: 'educate', step: 'check', role: job.owner, job: job.id, ...check });
  if (check.when === 'now') return { path: 'now', learned: '', remember: '' };

  const question = check.question || check.problem || job.task.slice(0, 200);
  let notes = [];
  if (check.when === 'learn') {
    notes = await memory.search(`${question} ${job.task}`).catch(() => []);
    emit({ type: 'educate', step: 'memory', role: job.owner, job: job.id, question, found: notes.map((n) => n.text) });
  }
  let web = [];
  try { web = await search(question); } catch { /* no key or no network: Research answers from what it knows */ }
  const task = [
    EDUCATE_RESEARCH_PROMPT, `Builder: ${job.owner}. Job ${job.id}: ${job.task}`, `Question: ${question}`,
    notes.length ? `Long-term memory:\n- ${notes.map((n) => n.text).join('\n- ')}` : '',
    web.length ? `Web search results:\n${web.map((r) => `${r.title}: ${r.content}`).join('\n\n')}` : '',
  ].filter(Boolean).join('\n\n');
  const json = parseJsonReply(await turn('research', task)) || {};
  const answer = str(json.answer, 1500);
  emit({ type: 'educate', step: 'research', role: 'research', job: job.id, question, answer, web: web.length });
  const learned = [
    `You educated yourself before this job (${check.when === 'more' ? 'you knew enough, but could do better' : 'you did not know enough'}).`,
    notes.length ? `From long-term memory (notes from earlier runs; check they fit):\n- ${notes.map((n) => n.text).join('\n- ')}` : '',
    answer ? `Research found: ${answer}` : '',
  ].filter(Boolean).join('\n');
  return { path: check.when, learned, remember: str(json.remember, 400) };
}
