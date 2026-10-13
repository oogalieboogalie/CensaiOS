// server/agentNetwork/endpointReceipt.js
//
// The helper's receipt for a call that came in through a shared agent's
// address (directly, or forwarded by a relay). It is signed here and sent
// back with the answer, so the asking side keeps a copy it can check.
// When the caller is another censaiOS that signed its request, the
// receipt names that install and agent and marks them verified; otherwise
// the asker is the key's label.

import crypto from 'node:crypto';
import pool from '../db.js';
import { createLogger } from '../logger.js';
import { getInstallSigner } from './installIdentity.js';
import { verifyAskRequest } from './askRequest.js';
import { buildReceiptBody, signReceipt, tokensFromTimings } from './receipts.js';
import { insertReceipt } from './receiptStore.js';
import { agentLabel } from './labels.js';

const log = createLogger('agent-receipts');

/** Who asked, as a receipt and the chat show it. */
export function askerFor({ request, question, keyLabel }) {
  const check = request ? verifyAskRequest(request, { prompt: question }) : { ok: false };
  if (!check.ok) {
    return { verified: false, install: 'outside', agent: null, label: `Outside app (key "${keyLabel}")`, ref: null };
  }
  const name = check.label || agentLabel(check.agent) || 'An agent';
  return { verified: true, install: check.install, agent: check.agent, label: name, ref: `${check.install}:${check.id}` };
}

/**
 * Sign and save the helper's receipt. Returns the signed receipt, or null
 * if it could not be made (the answer still goes back).
 */
export async function recordEndpointReceipt({
  endpoint, asker, channel = 'endpoint', question, answer, outcome, startedAt, timings, db = pool,
  signer: givenSigner = null, save = insertReceipt,
}) {
  try {
    const signer = givenSigner || await getInstallSigner(db);
    const receipt = signReceipt(buildReceiptBody({
      role: 'helper',
      channel,
      requestRef: asker.ref || `call:${crypto.randomUUID()}`,
      signer,
      asker: { install: asker.install, agent: asker.agent, label: asker.label, verified: asker.verified },
      helper: { card: endpoint.card_id, label: endpoint.agent_name },
      outcome,
      startedAt,
      finishedAt: new Date(),
      ...tokensFromTimings(timings),
      prompt: question,
      answer: outcome === 'completed' ? answer : null,
    }), signer);
    await save(db, { workspaceId: endpoint.workspace_id, receipt }).catch((error) => {
      log.warn('helper receipt not saved', { endpointId: endpoint.id, error: error.message });
    });
    return receipt;
  } catch (error) {
    log.warn('helper receipt not made', { endpointId: endpoint.id, error: error.message });
    return null;
  }
}
