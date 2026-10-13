// Ask an agent on another censaiOS install (imported from its Share panel
// address and key). The call carries a signed note of who is asking; the
// answer comes back with the other install's signed receipt, which is
// checked and kept next to this install's own receipt for the request.
// Through a relay, a call to a computer that is off is queued there: the
// run goes back in the queue and looks again every little while until the
// answer arrives (up to a week).

import pool from '../../db.js';
import { createExternalGuardedFetch } from '../../agent-registry/adapters/egress.js';
import { loadCensaiKey } from '../../agent-registry/adapters/censaiImport.js';
import { parseAgentAddress } from '../../agentNetwork/address.js';
import { buildAskRequest } from '../../agentNetwork/askRequest.js';
import { getInstallSigner } from '../../agentNetwork/installIdentity.js';
import { buildReceiptBody, receiptCovers, signReceipt, verifyReceipt } from '../../agentNetwork/receipts.js';
import { insertReceipt } from '../../agentNetwork/receiptStore.js';
import { requesterLabel } from '../../agentNetwork/labels.js';
import { completeRun, failRun, recordRunAction } from '../../runs/lifecycle.js';
import { deferAgentCardRun } from '../defer.js';
import { publishAgentCardEvent } from '../events.js';

const CALL_TIMEOUT_MS = 150_000;
const MAX_RESULT_CHARS = 60_000;
const MAX_QUEUE_MS = 7 * 24 * 60 * 60 * 1000;
export const RELAY_RECHECK_MS = Math.max(1000, Number(process.env.AGENT_RELAY_RECHECK_MS) || 10_000);

class RemoteCallError extends Error {
  constructor(message, receipt = null) {
    super(message);
    this.receipt = receipt;
  }
}

async function readJson(res) {
  return res.json().catch(() => ({}));
}

function replyOutcome(status, body) {
  if (status === 200 && typeof body?.answer === 'string') {
    if (body.answer.length > MAX_RESULT_CHARS) throw new RemoteCallError('The other agent\'s answer was too long.', body.receipt);
    return { answer: body.answer, receipt: body.receipt || null };
  }
  const why = body?.error || body?.message || `HTTP ${status}`;
  throw new RemoteCallError(`The other censaiOS said: ${why}`, body?.receipt || null);
}

async function writeAskerReceipt(db, { run, card, address, signer, prompt, answer, helperReceipt, startedAt, outcome }) {
  const meta = run.metadata || {};
  const counter = helperReceipt && verifyReceipt(helperReceipt).ok
    && receiptCovers(helperReceipt, { prompt, ...(answer != null ? { answer } : {}) }) ? helperReceipt : null;
  const cost = counter?.body?.cost || {};
  const receipt = signReceipt(buildReceiptBody({
    role: 'asker',
    channel: address.viaRelay ? 'relay' : 'endpoint',
    requestRef: meta.helpRequestId || run.id,
    signer,
    asker: { agent: meta.requester?.kind === 'agent' ? meta.requester.id : null, label: requesterLabel(meta.requester) },
    helper: { install: address.installId || counter?.body?.signer?.install || 'unknown', card: card.id, label: card.name },
    outcome,
    startedAt,
    finishedAt: new Date(),
    // The other install spent these tokens; copied from its signed receipt.
    tokensIn: cost.tokensIn, tokensOut: cost.tokensOut, price: cost.price || null,
    prompt,
    answer,
  }), signer);
  await insertReceipt(db, {
    workspaceId: meta.workspaceId, receipt, helpRequestId: meta.helpRequestId || null,
    counterReceipt: helperReceipt || null,
  });
  return { receipt, counterVerified: Boolean(counter) };
}

export async function executeCensaiAgentCardRun(run, executor, {
  card, db = pool, fetchImpl, getSigner = () => getInstallSigner(db), recheckMs = RELAY_RECHECK_MS, now = () => Date.now(),
} = {}) {
  const metadata = { ...(run.metadata || {}), runId: run.id };
  const emit = (event) => publishAgentCardEvent(metadata, event);
  const prompt = String(metadata.prompt || '');
  const address = parseAgentAddress(executor.endpoint);
  const fetcher = createExternalGuardedFetch({ fetchImpl });
  const relayCall = metadata.relayCall || null;
  const startedAt = relayCall?.sentAt || run.started_at || run.created_at || new Date().toISOString();
  let signer = null;
  try {
    signer = await getSigner();
    const key = await loadCensaiKey(db, card);
    if (!key) throw new RemoteCallError('The key for this agent is missing. Add the agent again in the Agent Registry.');
    const auth = { Authorization: `Bearer ${key}` };
    let reply;
    if (relayCall) {
      const res = await fetcher(relayCall.statusUrl, { headers: auth, signal: AbortSignal.timeout(30_000) });
      const body = await readJson(res);
      if (body.state !== 'answered') {
        if (now() - Date.parse(relayCall.sentAt) > MAX_QUEUE_MS) throw new RemoteCallError('The other computer did not come back within a week.');
        await deferAgentCardRun({ db, runId: run.id, delayMs: recheckMs });
        return { status: 'waiting' };
      }
      reply = replyOutcome(body.status, body.body);
    } else {
      await recordRunAction({
        runId: run.id, sequence: 1, name: 'agent_card.external_dispatch', status: 'succeeded',
        metadata: { adapter: 'censai', protocolVersion: executor.protocolVersion, viaRelay: address.viaRelay },
      });
      emit({ type: 'call.event', status: 'external_dispatch' });
      const request = buildAskRequest({
        signer, id: metadata.helpRequestId || run.id, to: address.mcpUrl, prompt,
        agent: metadata.requester?.kind === 'agent' ? metadata.requester.id : null,
        label: requesterLabel(metadata.requester),
      });
      const sentAt = new Date().toISOString();
      const res = await fetcher(address.askUrl, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ message: prompt, request }),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
      const body = await readJson(res);
      if (res.status === 202 && body?.queued && body.statusUrl) {
        // The relay is holding it for a computer that is off.
        await deferAgentCardRun({
          db, runId: run.id, delayMs: recheckMs,
          patch: { relayCall: { callId: body.callId, statusUrl: body.statusUrl, sentAt } },
        });
        emit({ type: 'call.event', status: 'waiting_at_relay' });
        return { status: 'waiting' };
      }
      reply = replyOutcome(res.status, body);
    }
    const { receipt, counterVerified } = await writeAskerReceipt(db, {
      run, card, address, signer, prompt, answer: reply.answer, helperReceipt: reply.receipt, startedAt, outcome: 'completed',
    });
    const timings = { total_ms: Date.parse(receipt.body.finishedAt) - Date.parse(startedAt), adapter: 'censai', model_calls: [], tool_calls: [] };
    await completeRun({ runId: run.id, metadata: { result: reply.answer, tools: [], timings, counterVerified } });
    emit({ type: 'call.complete', status: 'succeeded', result: reply.answer, tools: [], timings });
    return { status: 'succeeded', result: reply.answer };
  } catch (error) {
    if (signer) {
      await writeAskerReceipt(db, {
        run, card, address, signer, prompt, answer: null, helperReceipt: error.receipt || null, startedAt, outcome: 'failed',
      }).catch(() => {});
    }
    await failRun({ runId: run.id, error });
    emit({ type: 'call.failed', status: 'failed', error: error.message || 'The other censaiOS did not answer.' });
    return { status: 'failed', error: error.message || 'The other censaiOS did not answer.' };
  }
}
