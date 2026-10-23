// server/agentNetwork/helpReceipt.js
//
// Writes the receipt for a help request that ran on this install (a
// built-in agent, or an imported A2A / n8n agent called from here). One
// receipt with role "both", because this install is the asker and the
// side that ran it. Help requests to an agent on another censaiOS write
// their own receipts in executors/censai.js, with the other install's half.
// Never throws: a receipt that cannot be written is logged, the answer
// still arrives.

import pool from '../db.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { getInstallSigner } from './installIdentity.js';
import { buildReceiptBody, cardPrice, signReceipt, tokensFromTimings } from './receipts.js';
import { insertReceipt } from './receiptStore.js';
import { requesterLabel } from './labels.js';

const log = createLogger('agent-receipts');

async function loadHelpRun(db, runId) {
  const { rows: [row] } = await db.query(
    `SELECT r.id, r.status, r.started_at, r.completed_at, r.created_at, r.metadata,
            h.id AS help_id, h.workspace_id, h.requester_kind, h.requester_id, h.target_card_id,
            c.name AS card_name, c.metadata AS card_metadata
       FROM runs r
       JOIN agent_help_requests h ON h.id = (r.metadata->>'helpRequestId')::uuid
       JOIN agent_cards c ON c.id = h.target_card_id
      WHERE r.id = $1`,
    [runId],
  );
  return row || null;
}

export function helpReceiptBody(row, signer) {
  const meta = row.metadata || {};
  const succeeded = row.status === 'succeeded';
  const tokens = tokensFromTimings(meta.timings);
  return buildReceiptBody({
    role: 'both',
    channel: 'board',
    requestRef: row.help_id,
    signer,
    asker: {
      agent: row.requester_kind === 'agent' ? row.requester_id : null,
      label: requesterLabel({ kind: row.requester_kind, id: row.requester_id }),
    },
    helper: { card: row.target_card_id, label: row.card_name },
    outcome: succeeded ? 'completed' : 'failed',
    startedAt: row.started_at || row.created_at,
    finishedAt: row.completed_at || new Date(),
    ...tokens,
    price: succeeded ? cardPrice({ metadata: row.card_metadata }) : null,
    prompt: meta.prompt,
    answer: succeeded && typeof meta.result === 'string' ? meta.result : null,
  });
}

/** Call after a help run finished (either way). */
export async function recordHelpRunReceipt(run, { db = pool } = {}) {
  if (!run?.metadata?.helpRequestId || run.metadata.executorKind === 'censai') return null;
  try {
    const row = await loadHelpRun(db, run.id);
    if (!row) return null;
    const signer = await getInstallSigner(db);
    const receipt = signReceipt(helpReceiptBody(row, signer), signer);
    return await insertReceipt(db, { workspaceId: row.workspace_id, receipt, helpRequestId: row.help_id });
  } catch (error) {
    log.warn('help receipt not written', { runId: run.id, code: safeErrorCode(error) });
    return null;
  }
}
