// start_helper (diagram 15): a sub-agent starts a nano-agent for one job. The
// helper is one model call on the sub-agent's own model and the person's own
// key, with no tools; its answer is saved in the sub-agent's data box and
// returned, and the helper is gone.
import { getSubAgentById, getSubAgents, scratchpadWrite } from '../../memory.js';
import { getSubAgentModelConfig } from '../../chatModel/prompts.js';
import { callModel, createModelAccessContext, workspaceUsageSink } from '../../aiGateway/index.js';
import { HELPER_JOBS, HELPER_MAX_INPUT, HELPER_TEMPERATURE, helperJob, helperKey, helperPrompt } from '../../../src/lib/agents/nanoHelpers.js';
import { boxNumbers } from '../../../src/lib/agents/dataBoxes.js';

export async function handleStartHelper(agentId, args = {}, context = {}, { ask = callModel } = {}) {
  const sub = context.workspaceId ? await getSubAgentById(agentId, context) : null;
  if (!sub) return 'Only a sub-agent can start a helper. Main agents use dispatch_squad or create_sub_agent.';
  const job = helperJob(args.job);
  if (!job) return `Pick one job for the helper: ${Object.keys(HELPER_JOBS).join(', ')}.`;
  const task = String(args.task || '').trim();
  if (!task) return 'Say what the helper should do (task).';

  const { modelProvider, modelName, baseUrl, apiKey } = getSubAgentModelConfig(sub);
  const name = `${sub.name} helper (${job})`;
  const input = String(args.input || '').slice(0, HELPER_MAX_INPUT);
  const data = await ask({
    config: { provider: modelProvider, model: modelName, baseUrl, apiKey },
    accessContext: createModelAccessContext({ userId: context.userId, workspaceId: context.workspaceId, source: 'nano-helper' }),
    body: {
      model: modelName,
      max_tokens: 1500,
      temperature: HELPER_TEMPERATURE,
      messages: [
        { role: 'system', content: helperPrompt({ name, job, parent: sub.name, task }) },
        { role: 'user', content: input ? `${task}\n\n---\n${input}` : task },
      ],
    },
    logContext: { source: 'nano-helper', subAgentId: sub.id, job },
    usageAttribution: { workspaceId: context.workspaceId, actor: { kind: 'user', id: context.userId }, source: 'nano-helper', agentId: sub.id },
    usageSink: workspaceUsageSink,
  });
  const answer = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!answer) return `The ${job} helper came back empty. Nothing was saved.`;

  const key = helperKey(job);
  await scratchpadWrite(sub.id, args.project || 'default', key, answer, context);
  let box = '';
  try { box = boxNumbers(await getSubAgents(sub.parent_id, context)).get(sub.id) || ''; } catch {}
  return `The ${job} helper finished and was saved in your data box${box ? ` ${box}` : ''} as "${key}":\n\n${answer}`;
}
