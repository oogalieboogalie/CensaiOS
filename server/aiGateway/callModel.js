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
import { tagRejectedKey } from './missingKey.js';
import { scopeServerKey } from '../security/serverKeys.js';
import {
  applyModelAccess,
  resolveModelAccess,
  settleModelAccessFailure,
  settleModelAccessSuccess,
} from './modelAccess.js';

export const CHAT_COMPLETION_MODEL_KIND = 'chat.completion';
export { EMBEDDING_MODEL_KIND };
export { IMAGE_GENERATION_MODEL_KIND };

// A person's agents and workflows follow the same key rule as their chat: on
// a local install the server's own keys are the owner's (serverKeys.js).
function forCaller(config, accessContext) {
  return accessContext?.userId ? scopeServerKey(config, { userId: accessContext.userId }) : config;
}

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
  onDelta = null,
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
    const resolvedConfig = await forCaller(config || resolveImageGenerationModelConfig({
      modelProvider,
      modelName: modelName || body?.model || null,
    }), accessContext);
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

  const resolvedConfig = await forCaller(config || resolveChatModelConfig({
    modelProvider,
    modelName: modelName || body?.model || null,
  }), accessContext);
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
      onDelta,
    });
  } catch (error) {
    return settleModelAccessFailure(access, tagRejectedKey(error, prepared.config?.provider));
  }
  return settleModelAccessSuccess(access, result);
}
