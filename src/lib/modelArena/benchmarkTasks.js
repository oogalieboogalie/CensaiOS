// The premade benchmark tasks. Every model gets exactly the same request,
// so their results can be compared, and the cost is known before a race
// starts. Only runs of these tasks go into the Benchmarks rankings; a
// request someone types in is kept as their own note, never ranked.
// Each task carries what a right answer looks like, so a person (or the
// judge) can mark it right or wrong.
import { estimateCost, SAMPLE_TASKS } from './arenaCatalog.js';

// What a right answer looks like for the arena's original scout jobs.
const SCOUT_CHECKS = {
  map: { kind: 'Code', expectOutput: 220, check: 'cart.js exports addItem and total, used by tax.js. tax.js exports TAX_RATE and withTax, used by Checkout.jsx and orders.js. Renaming total() breaks only src/lib/tax.js (its import and its call).' },
  pinpoint: { kind: 'Code', expectOutput: 60, check: 'src/lib/tax.js, line 2 (export const TAX_RATE = 0.07). Any column that points at that line or at 0.07 is fine; any other file is wrong.' },
  ripple: { kind: 'Code', expectOutput: 220, check: 'Change: src/lib/tax.js (a way to get the tax alone, or the subtotal) and Checkout.jsx (show subtotal and tax). Must NOT change: cart.js total() and orders.js (it must still charge withTax).' },
  route: { kind: 'Reasoning', expectOutput: 260, check: 'Small: 1 (rename), 3 (find withTax), 4 (release notes). Large: 2 (billing database), 5 (splitting the component). Valid JSON only.' },
};

const MORE_TASKS = [
  {
    id: 'fix', label: 'Fix the bug', kind: 'Code', expectOutput: 90,
    system: 'You fix bugs. Reply with the fixed function only, no explanation.',
    prompt: 'This should return the last n items of a list, but lastItems([1,2,3,4], 2) returns [2,3,4]. Fix it.\n\nfunction lastItems(list, n) {\n  return list.slice(list.length - n - 1);\n}',
    check: 'Returns list.slice(list.length - n) (or the same thing written another way). list.slice(-n) alone is fine too. Anything that still returns 3 items is wrong.',
  },
  {
    id: 'rewrite', label: 'Rewrite it plainly', kind: 'Writing', expectOutput: 70,
    system: 'You rewrite text in plain words. Reply with the rewrite only.',
    prompt: 'Rewrite this in plain words, under 40 words, keeping every fact:\n\n"Pursuant to our previous correspondence, please be advised that the inspection, which had been tentatively scheduled for Thursday, has been moved forward to Wednesday at 10 a.m., and the buyer\'s agent, Dana, will be in attendance in lieu of the buyer."',
    check: 'Under 40 words. Keeps all three facts: the inspection moved from Thursday to Wednesday, 10 a.m., and Dana (the buyer\'s agent) comes instead of the buyer.',
  },
  {
    id: 'summary', label: 'Sum up a meeting', kind: 'Writing', expectOutput: 130,
    system: 'You write short meeting summaries. Reply with exactly three bullet points.',
    prompt: 'Sum up these notes as three bullets, each with who does it and by when:\n\nSam said the listing photos are late, the photographer can come Friday. Priya will call the photographer today to book Friday. We agreed the open house moves to Saturday the 24th. Alma will update the listing and the flyer by Thursday. Someone mentioned coffee. Priya also owns ordering signs, by Wednesday.',
    check: 'Three bullets: Priya books the photographer for Friday (call today); Alma updates the listing and flyer by Thursday (open house now Saturday the 24th); Priya orders signs by Wednesday. No coffee.',
  },
  {
    id: 'extract', label: 'Pull out the data', kind: 'Data', expectOutput: 80,
    system: 'You extract data. Reply with JSON only.',
    prompt: 'Return {"address", "price", "beds", "baths", "sqft"} as JSON, numbers as numbers:\n\nJust listed! Charming 3 bed / 2.5 bath craftsman at 418 Alder Lane, Tacoma WA. 1,940 sq ft on a corner lot. Offered at $612,500. Seller is flexible on closing.',
    check: '{"address": "418 Alder Lane, Tacoma WA", "price": 612500, "beds": 3, "baths": 2.5, "sqft": 1940}. Valid JSON only; numbers must be numbers.',
  },
  {
    id: 'commission', label: 'Work out the money', kind: 'Reasoning', expectOutput: 160,
    system: 'Show the steps briefly, then the answer on its own line.',
    prompt: 'A house sells for $400,000. The commission is 6%, split evenly between the buyer\'s and the seller\'s brokerage. The listing agent keeps 70% of their brokerage\'s share. How much does the listing agent take home?',
    check: '$8,400 (6% of 400,000 is 24,000; half is 12,000; 70% of that is 8,400).',
  },
  {
    id: 'dates', label: 'Count the days', kind: 'Reasoning', expectOutput: 100,
    system: 'Answer with the date as YYYY-MM-DD, then one short sentence.',
    prompt: 'An offer is accepted on 2026-10-13. Closing is 45 days later. What is the closing date?',
    check: '2026-11-27.',
  },
  {
    id: 'email', label: 'Real estate email', kind: 'Writing', expectOutput: 190,
    system: 'You write warm, short emails for a real estate agent. Reply with the email only.',
    prompt: 'Write a first email to Jordan, a first-time buyer who filled in a form on our site saying they want a 2-bedroom near downtown under $450,000. Under 120 words. End with one specific next step.',
    check: 'Under 120 words, addressed to Jordan, mentions 2 bedrooms, near downtown and under $450,000, sounds like a person, and ends with one specific next step (for example a call time or a short list of homes).',
  },
];

// Changing a task's wording or its right answer? Give it `version: 2` so
// old and new results are never compared.
export const BENCHMARK_TASKS = Object.freeze([
  ...SAMPLE_TASKS.map((task) => ({ ...task, ...SCOUT_CHECKS[task.id] })),
  ...MORE_TASKS,
].map((task) => ({ version: 1, ...task })));

/** The premade task this exact request is, or null for a typed-in one. */
export function benchmarkTaskFor(prompt, system = '') {
  return BENCHMARK_TASKS.find((task) => task.prompt === prompt && (task.system || '') === (system || '')) || null;
}

export function taskById(id) {
  return BENCHMARK_TASKS.find((task) => task.id === id) || null;
}

// About four letters a token; a typed-in request is guessed at 500 reply tokens.
const TYPED_OUTPUT_GUESS = 500;
export const tokenGuess = (text) => Math.ceil(String(text || '').length / 4);

/**
 * Cost of one race lane before it runs: input from the request's length,
 * output from what the task usually needs. null when no price is on file.
 */
export function estimateLaneCost(lane, prompt, system = '') {
  const task = benchmarkTaskFor(prompt, system);
  const usage = { input: tokenGuess(prompt) + tokenGuess(system), output: task?.expectOutput || TYPED_OUTPUT_GUESS };
  return estimateCost(lane.provider, lane.model, usage);
}
