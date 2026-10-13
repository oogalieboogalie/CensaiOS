// A module's agent.ask: one question to the workspace's module model. Used by
// the /api/modules/ask route and by agents that ask a module for help.

import { callModel, createModelAccessContext } from '../aiGateway/index.js';
import { moduleModelConfig } from './modelConfig.js';
import { buildAskMessages } from './prompt.js';

export async function askModule({ userId, workspaceId, prompt, moduleName, source = 'module-ask' }) {
  const config = await moduleModelConfig({ userId, workspaceId });
  const completion = await callModel({
    accessContext: createModelAccessContext({ userId, workspaceId, source }),
    config,
    body: { model: config.model, temperature: 0.4, messages: buildAskMessages({ prompt, moduleName }) },
    timeoutMs: 60000,
    logContext: { source },
  });
  return String(completion?.choices?.[0]?.message?.content || '').trim();
}
