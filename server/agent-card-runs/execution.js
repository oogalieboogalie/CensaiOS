import { getAgentCard } from '../agent-registry/factories.js';
import { failRun } from '../runs/lifecycle.js';
import {
  agentCardExecutorFingerprint,
  resolveAgentCardExecutor,
} from './contract.js';
import { publishAgentCardEvent } from './events.js';
import { executeA2AAgentCardRun } from './executors/a2a.js';
import { executeBuiltInAgentCardRun } from './executors/builtin.js';
import { executeN8NChatAgentCardRun } from './executors/n8n.js';

async function failBeforeDispatch(run, error) {
  const metadata = { ...(run.metadata || {}), runId: run.id };
  await failRun({ runId: run.id, error });
  publishAgentCardEvent(metadata, {
    type: 'call.failed', status: 'failed', error: error.message || 'AgentCard call failed.',
  });
  return { status: 'failed', error: error.message || 'AgentCard call failed.' };
}

export async function executeAgentCardRun(run) {
  try {
    const card = await getAgentCard(run.metadata?.cardId);
    if (!card) throw new Error('AgentCard was removed after queueing.');
    const executor = resolveAgentCardExecutor(card);
    const currentFingerprint = agentCardExecutorFingerprint(card);
    const queuedFingerprint = run.metadata?.executorFingerprint;
    if ((executor.kind !== 'builtin' && !queuedFingerprint)
      || (queuedFingerprint && queuedFingerprint !== currentFingerprint)) {
      throw new Error('AgentCard executor changed after queueing.');
    }
    if (executor.kind === 'a2a') return executeA2AAgentCardRun(run, executor);
    if (executor.kind === 'n8n_chat') return executeN8NChatAgentCardRun(run, executor);
    return executeBuiltInAgentCardRun(run, card);
  } catch (error) {
    return failBeforeDispatch(run, error);
  }
}
