// Censai the orchestrator: the words that go to the family and to Censai's own
// model. Only the job, its checklist and what was really seen go in; nothing
// canned about the person or the board (the rule: no stuffed prompts).

import { agentName, clip } from './shape.js';

function howChecked(item) {
  if (item.how === 'tests') return ' (Censai runs the project\'s tests)';
  return item.how === 'file' ? ` (Censai looks for ${item.path})` : '';
}

/** The job as the family agent reads it. */
export function jobPrompt({ plan, job, earlier = [], total = 1 }) {
  const lines = [
    '[A job from Censai, the orchestrator]',
    `Censai is handing you part ${job.n} of ${total} of a plan for the person. Do the work now with your own tools, then answer with what you did.`,
    '',
    `The whole plan: ${plan.goal}`,
    plan.project ? `Project: ${plan.project}` : null,
    `Your job: ${job.task}`,
    '',
    'Censai checks off each item on this list itself before it counts as done:',
    ...(job.checklist || []).map((item) => `${item.n}. ${item.text}${howChecked(item)}`),
  ];
  if (earlier.length) {
    lines.push('', 'Earlier parts, already checked:');
    for (const done of earlier) lines.push(`- ${agentName(done.agentId)}: ${clip(done.answer, 600)}`);
  }
  lines.push(
    '',
    'Say plainly what you did. If you could not do part of it, say what and why. Do not claim anything you did not do.',
  );
  return lines.filter((line) => line !== null).join('\n');
}

/** Sent back once when items are not checked off: each one and what the check showed. */
export function sendBackPrompt(items = []) {
  const output = items.find((item) => item.detail)?.detail;
  return [
    'Censai checked your work against the list and these are not checked off yet:',
    ...items.map((item) => `- ${item.text}: ${item.line}`),
    output ? `\nWhat the tests showed (last lines):\n${clip(output, 1500)}` : null,
    '',
    'Please fix them and answer again with what you changed.',
  ].filter((line) => line !== null).join('\n');
}

const REVIEW_RULES = [
  'You are Censai, checking work a family member did before you tell the person about it.',
  'Judge each numbered item on its own against the job, what came back, and what was seen while checking.',
  'Be strict: an item passes only if what came back and what was seen show it is true now. "Will do", "should work", a guess, or a missing piece is a FAIL.',
  'Reply with one line per item and nothing else: the item number, PASS or FAIL, then one short plain sentence for the person, no jargon.',
].join(' ');

export function reviewMessages({ job, answer, items = [], seen = [] }) {
  const name = agentName(job.agentId);
  const body = [
    `Job for ${name}: ${job.task}`,
    '',
    'Items to judge:',
    ...items.map((item, index) => `${index + 1}. ${item.text}`),
    '',
    `What ${name} answered:`,
    clip(answer, 6000) || '(nothing)',
    seen.length ? `\nWhat I saw while checking:\n${seen.map((line) => `- ${line}`).join('\n')}` : null,
  ].filter((line) => line !== null).join('\n');
  return [{ role: 'system', content: REVIEW_RULES }, { role: 'user', content: body }];
}

function plain(text) {
  return String(text || '').replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim().replace(/^\|\s*|\s*\|$/g, '');
}

// A verdict is PASS or FAIL in capitals, right after the item's number or after the
// item's own words and a colon or dash ("2. The date shows: FAIL ..."), or after
// "Verdict:". "Pass the locale", "PASS/FAIL" and "PASS?" are not verdicts.
const TOKEN = '(PASS|FAIL)(?![/\\w?])';
const VERDICT = new RegExp(`^(?:[Ii]tem\\s*)?(\\d+)?\\s*[.):-]?\\s*(?:.*?\\s*[:|\u2013\u2014-]\\s*)?${TOKEN}[\\s.:,;|\u2013\u2014-]*(.*)$`);
const LABELED = /^(?:[Ii]tem\s*)?(\d+)?\s*[.):-]?\s*verdict\s*:?\s*(pass|fail)(?![/\w?])[\s.:,;-]*(.*)$/i;
const verdictOf = (line) => VERDICT.exec(line) || LABELED.exec(line);

// Strict: once any line says an item fails, it fails, whatever another line says.
function keep(current, next) {
  return !current || (current.ok && !next.ok) ? next : current;
}

/**
 * Map of item number (1 to count, as reviewMessages listed them) -> { ok, sentence }
 * from the read-over reply. An item the reply does not judge is left out, so
 * it stays not checked. With one item, a bare PASS or FAIL counts for it.
 */
export function parseItemReview(reply, count = 1) {
  const numbers = Array.from({ length: count }, (_, index) => index + 1);
  const verdicts = new Map();
  let loose = null;
  const lines = String(reply || '').split(/\r?\n/).map(plain).filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    const match = verdictOf(lines[i]);
    if (!match) continue;
    const ok = match[2].toUpperCase() === 'PASS';
    const rest = match[3] || '';
    if (match[1]) {
      const n = Number(match[1]);
      if (numbers.includes(n)) verdicts.set(n, keep(verdicts.get(n), { ok, sentence: clip(rest, 240) }));
    } else {
      const next = verdictOf(lines[i + 1] || '') ? '' : lines[i + 1] || '';
      loose = keep(loose, { ok, sentence: clip((rest || next).replace(/^line 2\s*:\s*/i, ''), 240) });
    }
  }
  if (numbers.length === 1 && !verdicts.size && loose) verdicts.set(numbers[0], loose);
  for (const verdict of verdicts.values()) {
    verdict.sentence ||= verdict.ok ? 'It checks out.' : 'It is not done yet.';
  }
  return verdicts;
}

const REPORT_RULES = [
  'You are Censai, casual but thorough. In one short sentence, tell the person what got done, the way a friend would.',
  'Use only the checked facts below: nothing added, nothing stretched, no jargon. A light touch of humor is fine; a wrong fact is not.',
].join(' ');

export function reportMessages(plan) {
  const facts = plan.jobs.map((job) => {
    const ticked = (job.checklist || []).filter((item) => item.state === 'ticked');
    return `- ${agentName(job.agentId)}: ${job.title}. Checked off: ${ticked.map((item) => `${item.text} (${item.line})`).join('; ')}`;
  });
  return [
    { role: 'system', content: REPORT_RULES },
    { role: 'user', content: [`What the person wanted: ${plan.goal}`, 'Checked facts:', ...facts].join('\n') },
  ];
}

function sentence(text) {
  const value = String(text || '').trim();
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

/** The one line the person reads. done: the model's sentence (or ours); otherwise always ours. */
export function summaryLine(plan, modelSentence = '') {
  if (plan.status === 'done') {
    const said = plain(String(modelSentence || '').split(/\r?\n/).find((line) => line.trim()) || '');
    const items = plan.jobs.reduce((sum, job) => sum + (job.checklist || []).length, 0);
    const list = items === 1 ? 'The one item on the list is checked off.' : `All ${items} items on the list are checked off.`;
    return said ? clip(said, 300) : `Done: ${plan.goal.replace(/[.!]$/, '')}. ${list}`;
  }
  const job = plan.jobs.find((entry) => !['done', 'skipped'].includes(entry.status));
  const later = [...new Set(plan.jobs.filter((entry) => entry.status === 'skipped').map((entry) => agentName(entry.agentId)))];
  const notStarted = later.length ? `${later.join(' and ')} did not start.` : '';
  if (plan.status === 'stopped') {
    const where = job ? ` while ${agentName(job.agentId)} was on part ${job.n}` : '';
    return `Stopped${where}, as you asked.${notStarted ? ` ${notStarted}` : ''}`;
  }
  const item = job ? (job.checklist || []).find((entry) => entry.n === job.stuckOn) : null;
  const part = job ? `${agentName(job.agentId)}'s part` : 'the plan';
  const where = item ? `"${clip(item.text, 120).replace(/[.!]$/, '')}" in ${part}` : part;
  const after = notStarted ? ` I stopped there, so ${notStarted}` : '';
  return `Stuck on ${where}. ${sentence(job?.error || 'Something went wrong')}${after}`;
}
