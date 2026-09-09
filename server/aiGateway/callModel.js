import { resolveChatModelConfig } from './providers.js';
import { resolveEmbeddingModelConfig } from './embeddingProviders.js';
import { requestChatCompletion } from './chatCompletion.js';
import {
  EMBEDDING_MODEL_KIND,
  requestEmbedding,
} from './embedding.js';
import { resolveImageGenerationModelConfig } from './imageProviders.js';
import {
  IMAGE_GENERATION_MODEL_KIND,
  requestImageGeneration,
} from './imageGeneration.js';
import { bestEffortUsageSink } from './usageSink.js';
import {
  applyModelAccess,
  resolveModelAccess,
  settleModelAccessFailure,
  settleModelAccessSuccess,
} from './modelAccess.js';

export const CHAT_COMPLETION_MODEL_KIND = 'chat.completion';
export { EMBEDDING_MODEL_KIND };
export { IMAGE_GENERATION_MODEL_KIND };

export async function callModel({
  kind = CHAT_COMPLETION_MODEL_KIND,
  modelProvider = null,
  modelName = null,
  config = null,
  body,
  timeoutMs,
  logContext = {},
  retry = {},
  usageAttribution = null,
  usageSink = null,
  accessContext = null,
} = {}) {
  const safeUsageSink = bestEffortUsageSink(usageSink);
  const access = await resolveModelAccess({
    kind,
    modelProvider,
    modelName,
    config,
    body,
    accessContext,
  });
  const effectiveAttribution = access.governed ? access.attribution : usageAttribution;
  if (kind === EMBEDDING_MODEL_KIND) {
    const resolvedConfig = config || resolveEmbeddingModelConfig({
      modelProvider,
      modelName: modelName || body?.model || null,
    });
    const prepared = applyModelAccess(access, { config: resolvedConfig, body, retry });

    return requestEmbedding({
      config: prepared.config,
      body: prepared.body,
      timeoutMs,
      logContext,
      usageAttribution: effectiveAttribution,
      usageSink: safeUsageSink,
    });
  }

  if (kind === IMAGE_GENERATION_MODEL_KIND) {
    const resolvedConfig = config || resolveImageGenerationModelConfig({
      modelProvider,
      modelName: modelName || body?.model || null,
    });
    const prepared = applyModelAccess(access, { config: resolvedConfig, body, retry });

    return requestImageGeneration({
      config: prepared.config,
      body: prepared.body,
      timeoutMs,
      logContext,
      usageAttribution: effectiveAttribution,
      usageSink: safeUsageSink,
    });
  }

  if (kind !== CHAT_COMPLETION_MODEL_KIND) throw new Error(`Unsupported model call kind: ${kind}`);

  const resolvedConfig = config || resolveChatModelConfig({
    modelProvider,
    modelName: modelName || body?.model || null,
  });
  const prepared = applyModelAccess(access, { config: resolvedConfig, body, retry });

  let result;
  try {
    result = await requestChatCompletion({
      config: prepared.config,
      body: prepared.body,
      timeoutMs,
      logContext,
      retry: prepared.retry,
      usageAttribution: effectiveAttribution,
      usageSink: safeUsageSink,
    });
  } catch (error) {
    return settleModelAccessFailure(access, error);
  }
  return settleModelAccessSuccess(access, result);
}
