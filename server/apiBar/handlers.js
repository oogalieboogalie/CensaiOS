// server/apiBar/handlers.js
//
// The few bar actions that are not one existing route:
//   finance.*  read the Open Books windows from the saved copy of the board
//              (fetched through the board's own route, so access rules hold)
//              and answer with the Books app's own math.
//   agents.*   list shared agents with their ID cards, and ask one through
//              the same call path, limits and receipts as its outside door.

import { readBooks } from '../../src/lib/yorware/books/booksModel.js';
import { categoryTotals, filterTransactions } from '../../src/lib/yorware/books/booksQueries.js';
import { getCategory } from '../../src/lib/yorware/books/categories.js';
import { dispatchInternal } from './dispatch.js';
import { agentIdentity } from './signing.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const YEAR = /^\d{4}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dollars = (cents) => Math.round(cents) / 100;

function fail(status, error) {
  return { status, data: { error } };
}

async function booksOnBoard(ctx) {
  const answer = await dispatchInternal(ctx.req, ctx.res, {
    method: 'GET', path: '/api/client-state/homebase.workspace.v1', asUser: ctx.asUser,
    query: { workspaceId: ctx.input.workspaceId },
  });
  // A board never saved has no books; a wrong board id is an error.
  if (answer.status === 404 && answer.data?.value === null) return { books: [] };
  if (answer.status >= 400) return { error: answer };
  const wins = Array.isArray(answer.data?.value?.wins) ? answer.data.value.wins : [];
  const books = wins
    .filter((w) => w && (w.kind === 'yorBooks' || w.type === 'yorBooks'))
    .map((w) => ({ title: String(w.title || w.data?.title || 'Books'), books: readBooks(w) }));
  return { books };
}

async function financeSearch(ctx) {
  const input = ctx.input;
  const filter = {
    search: String(input.query || input.search || '').slice(0, 200),
    year: YEAR.test(String(input.year || '')) ? String(input.year) : null,
    from: ISO.test(String(input.from || '')) ? input.from : null,
    to: ISO.test(String(input.to || '')) ? input.to : null,
  };
  const found = await booksOnBoard(ctx);
  if (found.error) return found.error;
  const transactions = [];
  for (const { title, books } of found.books) {
    for (const t of filterTransactions(books, filter)) {
      const c = getCategory(t.categoryId);
      transactions.push({
        books: title, date: t.date, description: t.description, amount: dollars(t.amountCents),
        category: c.name, tax_line: c.taxLine || null, account: t.accountName, needs_review: Boolean(t.needsReview), notes: t.notes,
      });
    }
  }
  transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { status: 200, data: { books_found: found.books.length, transactions } };
}

async function financeSummary(ctx) {
  const found = await booksOnBoard(ctx);
  if (found.error) return found.error;
  const year = YEAR.test(String(ctx.input.year || '')) ? Number(ctx.input.year) : new Date().getFullYear();
  const totals = new Map();
  let moneyIn = 0;
  let moneyOut = 0;
  for (const { books } of found.books) {
    for (const [categoryId, cents] of categoryTotals(books, year)) {
      totals.set(categoryId, (totals.get(categoryId) || 0) + cents);
    }
    for (const t of books.transactions) {
      if (!t.date.startsWith(String(year))) continue;
      if (t.amountCents > 0) moneyIn += t.amountCents; else moneyOut += t.amountCents;
    }
  }
  const categories = [...totals.entries()]
    .map(([id, cents]) => ({ category: getCategory(id).name, tax_line: getCategory(id).taxLine || null, total: dollars(cents) }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  return {
    status: 200,
    data: { year, books_found: found.books.length, money_in: dollars(moneyIn), money_out: dollars(moneyOut), net: dollars(moneyIn + moneyOut), categories },
  };
}

async function agentsList(ctx) {
  const { rows } = await ctx.deps.db.query(
    `SELECT id, agent_id, agent_name, created_at FROM agent_endpoints
      WHERE user_id = $1 AND enabled = TRUE ORDER BY created_at`,
    [ctx.userId],
  );
  const installId = ctx.signer?.installId || null;
  return {
    status: 200,
    data: {
      install_id: installId,
      agents: rows.map((r) => ({
        id: r.id,
        name: r.agent_name,
        identity: installId ? agentIdentity(installId, r.id) : null,
      })),
    },
  };
}

async function agentsAsk(ctx) {
  const endpointId = String(ctx.input.agent || ctx.input.id || '').trim();
  if (!UUID.test(endpointId)) return fail(400, 'Say which agent: put its id from agents > list in "agent".');
  const calls = ctx.deps.agentCalls;
  let question;
  try {
    question = calls.cleanQuestion(ctx.input.message);
  } catch (error) {
    return fail(error.statusCode || 400, error.message);
  }
  const { rows: [endpoint] } = await ctx.deps.db.query(
    'SELECT * FROM agent_endpoints WHERE id = $1 AND user_id = $2',
    [endpointId, ctx.userId],
  );
  if (!endpoint) return fail(404, 'No agent you share has that id.');
  if (!endpoint.enabled) return fail(403, `${endpoint.agent_name} is not shared right now. Turn sharing on in censaiOS first.`);
  const row = { ...endpoint, token_id: `bar:${ctx.keyId || `board:${ctx.userId}`}`, token_label: `API Bar: ${ctx.keyLabel || 'the board'}` };
  const identity = ctx.signer ? agentIdentity(ctx.signer.installId, endpoint.id) : null;
  try {
    const out = await calls.performOutsideCall({ row, question, via: 'http' }, calls.deps);
    return {
      status: 200,
      agent: identity ? { id: endpoint.id, name: endpoint.agent_name, identity } : null,
      data: { agent: out.agentName, identity, answer: out.answer, ...(out.receipt ? { receipt: out.receipt } : {}) },
    };
  } catch (error) {
    return fail(error.statusCode || 502, error.message || 'The agent could not answer just now.');
  }
}

export const BAR_HANDLERS = Object.freeze({
  'finance.search': financeSearch,
  'finance.summary': financeSummary,
  'agents.list': agentsList,
  'agents.ask': agentsAsk,
});
