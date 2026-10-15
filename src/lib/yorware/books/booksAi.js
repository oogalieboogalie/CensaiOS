// The AI parts of YorWare Books, run through one of your censaiOS agents
// (so it uses your own key, Claude or Ollama, like every other chat). Open
// Books (MIT) gave its assistant database tools; here the agent gets a
// written summary of the books instead, built fresh for every question.
import { CATEGORIES, getCategory } from './categories.js';
import { buildScheduleC } from './reports.js';
import { categoryTotals, filterTransactions, reviewCount } from './booksQueries.js';
import { metricDefs } from './booksEdits.js';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const money = (cents) => usd.format(cents / 100 + 0);

const AI_BATCH = 25;

/** What the assistant knows about the books for one question. */
export function booksBrief(books, today, businessName = 'this business') {
  const year = Number(today.slice(0, 4));
  const s = buildScheduleC(categoryTotals(books, year), year);
  const lines = [
    `Today is ${today}. These are the books of ${businessName}, kept in censaiOS. Amounts are US dollars; money out is negative.`,
    `Year to date ${year}: gross income ${money(s.grossIncomeCents)}, deductible expenses ${money(s.totalExpensesCents)}, net profit ${money(s.netProfitCents)}, estimated self-employment tax ${money(s.seTax.totalCents)}.`,
    `${reviewCount(books)} transactions need a category check. Accounts: ${books.accounts.map((a) => `${a.name} (${a.type.replace('_', ' ')})`).join(', ')}.`,
  ];
  const months = new Map();
  for (const t of books.transactions) {
    const m = t.date.slice(0, 7);
    const kind = getCategory(t.categoryId).kind;
    const row = months.get(m) ?? { income: 0, expense: 0, n: 0 };
    if (kind === 'income') row.income += t.amountCents;
    else if (kind === 'expense' || kind === 'cogs') row.expense -= t.amountCents;
    row.n += 1;
    months.set(m, row);
  }
  lines.push('', 'By month (income / business expenses / count):');
  for (const [m, r] of [...months.entries()].sort().slice(-18)) lines.push(`- ${m}: ${money(r.income)} / ${money(r.expense)} / ${r.n}`);
  lines.push('', `Schedule C lines for ${year}:`);
  for (const l of s.expenseLines) lines.push(`- line ${l.line} ${l.label}: spent ${money(l.amountCents)}, deductible ${money(l.deductibleCents)}`);
  for (const d of [...s.otherDeductions, ...s.nonPl]) lines.push(`- ${d.category.name}: ${money(d.amountCents)}`);
  if (books.events.length) {
    lines.push('', 'Events (marketing and other things that might move the numbers):');
    for (const e of books.events.slice(-30)) lines.push(`- ${e.date} ${e.kind}: ${e.title}${e.notes ? ` (${e.notes})` : ''}`);
  }
  const defs = metricDefs(books);
  const perMonth = new Map();
  for (const m of books.metrics) {
    const k = `${m.date.slice(0, 7)} ${defs.find((d) => d.key === m.key)?.name ?? m.key}`;
    perMonth.set(k, (perMonth.get(k) || 0) + m.value);
  }
  if (perMonth.size) {
    lines.push('', 'Numbers logged per month:');
    for (const [k, v] of [...perMonth.entries()].sort().slice(-40)) lines.push(`- ${k}: ${v}`);
  }
  lines.push('', 'Most recent transactions:');
  for (const t of filterTransactions(books).slice(0, 60)) {
    lines.push(`- ${t.date} ${t.description} ${money(t.amountCents)} [${getCategory(t.categoryId).name}]${t.notes ? ` note: ${t.notes}` : ''}`);
  }
  return lines.join('\n');
}

/** The message the agent gets: the brief, how to answer, and the question. */
export function assistantPrompt(books, today, question, businessName) {
  return [
    'You are the bookkeeping assistant inside YorWare Books. Answer from the books below only; say so when they do not show something.',
    'Use plain words and short answers, show the dollar figures you used, and remind the owner it is not tax advice when the question is about taxes.',
    '',
    '--- BOOKS ---',
    booksBrief(books, today, businessName),
    '--- END BOOKS ---',
    '',
    `Question: ${question}`,
  ].join('\n');
}

const SYSTEM = `You categorize a small business's bank and card transactions into US tax categories (IRS Schedule C and related forms). For each transaction pick the single best category id from the list. Use the business's own past choices as the strongest signal. Money in from an unknown source might be sales, a refund, a transfer, or a loan; only call it income when the description suggests a customer payment. Clearly personal spending is "owner_draw"; moving money between the business's own accounts is "transfer". Give an honest confidence from 0 to 1: below 0.6 when the description alone can't tell (for example a big-box store or a person's name).`;

/** Transactions the built-in categorizer was unsure of, in batches for the AI pass. */
export function aiCandidates(books, limit = 100) {
  const list = books.transactions.filter((t) => t.needsReview && ['fallback', 'keyword'].includes(t.categorySource)).slice(0, limit);
  const batches = [];
  for (let i = 0; i < list.length; i += AI_BATCH) batches.push(list.slice(i, i + AI_BATCH));
  return batches;
}

/** One AI sorting request: categories, the owner's past choices, and the batch. */
export function aiSortPrompt(books, batch) {
  const seen = new Set();
  const examples = books.transactions
    .filter((t) => ['user', 'rule'].includes(t.categorySource) && t.merchantKey && !seen.has(t.merchantKey) && seen.add(t.merchantKey))
    .slice(0, 60)
    .map((t) => `- ${t.description} (${t.amountCents >= 0 ? 'in' : 'out'}) -> ${t.categoryId}`);
  const items = batch.map((t) => JSON.stringify({ id: t.id, date: t.date, description: t.description, direction: t.amountCents >= 0 ? 'money in' : 'money out', amount: money(Math.abs(t.amountCents)), current_guess: t.categoryId }));
  return [
    SYSTEM,
    '',
    'Categories:',
    ...CATEGORIES.map((c) => `- ${c.id}: ${c.name} (${c.kind}). ${c.description}`),
    '',
    examples.length ? `How this business has categorized similar things before:\n${examples.join('\n')}\n` : '',
    'Categorize these transactions:',
    ...items,
    '',
    'Reply with only JSON, no other words: {"results":[{"id":"...","category_id":"...","confidence":0.0,"reason":"a few words"}]}',
  ].join('\n');
}

/** Reads the JSON answer out of an agent's reply, tolerating code fences and chatter. */
export function parseAiSort(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end <= start) return [];
  try {
    const data = JSON.parse(s.slice(start, end + 1));
    return Array.isArray(data?.results) ? data.results : [];
  } catch {
    return [];
  }
}
