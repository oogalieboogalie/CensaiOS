// server/agentNetwork/receiptStore.js
//
// Postgres access for agent receipts. Receipts are written once and never
// changed, except that the asking side may attach the helper install's
// signed half when it arrives. Reads are scoped to one workspace.

import { receiptSummary, verifyReceipt } from './receipts.js';

const MAX_LIST = 200;

export async function insertReceipt(db, { workspaceId, receipt, helpRequestId = null, counterReceipt = null }) {
  const body = receipt.body;
  const { rows: [row] } = await db.query(
    `INSERT INTO agent_receipts
       (id, workspace_id, role, channel, request_ref, help_request_id, card_id, asker_label, helper_label,
        outcome, started_at, finished_at, tokens_in, tokens_out, price_cents, body, signature, counter_receipt)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18::jsonb)
     ON CONFLICT (role, request_ref) DO NOTHING
     RETURNING *`,
    [
      body.id, String(workspaceId), body.role, body.channel, body.request, helpRequestId,
      body.helper.card, body.asker.label || body.asker.agent, body.helper.label,
      body.outcome, body.startedAt, body.finishedAt, body.cost.tokensIn, body.cost.tokensOut,
      body.cost.price?.cents ?? null, JSON.stringify(body), receipt.signature,
      counterReceipt ? JSON.stringify(counterReceipt) : null,
    ],
  );
  return row || null;
}

function asReceipt(row) {
  return { body: row.body, signature: row.signature };
}

/** The shape the Receipts tab and chat read: the signed receipt plus what checked out. */
export function publicReceipt(row) {
  if (!row) return null;
  const receipt = asReceipt(row);
  const check = verifyReceipt(receipt);
  const counter = row.counter_receipt ? verifyReceipt(row.counter_receipt) : null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    helpRequestId: row.help_request_id || null,
    receipt,
    counterReceipt: row.counter_receipt || null,
    verified: check.ok,
    problem: check.reason,
    counterVerified: counter ? counter.ok : null,
    summary: receiptSummary(receipt, { verified: check.ok, counterVerified: counter ? counter.ok : null }),
    createdAt: row.created_at,
  };
}

export async function listReceipts(db, { workspaceId, limit = 50 }) {
  const { rows } = await db.query(
    'SELECT * FROM agent_receipts WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2',
    [String(workspaceId), Math.min(MAX_LIST, Math.max(1, Number(limit) || 50))],
  );
  return rows.map(publicReceipt);
}

export async function receiptForHelpRequest(db, helpRequestId) {
  const { rows: [row] } = await db.query(
    `SELECT * FROM agent_receipts WHERE help_request_id = $1
      ORDER BY (role = 'helper') ASC, created_at DESC LIMIT 1`,
    [helpRequestId],
  );
  return row || null;
}

export async function receiptByRef(db, { role, requestRef }) {
  const { rows: [row] } = await db.query(
    'SELECT * FROM agent_receipts WHERE role = $1 AND request_ref = $2', [role, String(requestRef)],
  );
  return row || null;
}
