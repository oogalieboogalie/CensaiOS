export function buildChatUsageRecord({
  ok,
  config = {},
  baseUrl = '',
  payload = {},
  data = null,
  error = null,
  ms = 0,
  attempts = 1,
  context = {},
} = {}) {
  return compactObject({
    type: 'chat_completion',
    ok: !!ok,
    source: context.source,
    provider: config.provider || null,
    model: payload.model || config.model || null,
    baseUrl,
    ms,
    attempts,
    messages: Array.isArray(payload.messages) ? payload.messages.length : 0,
    tools: Array.isArray(payload.tools) ? payload.tools.length : 0,
    finishReason: data?.choices?.[0]?.finish_reason,
    usage: tokenUsage(data?.usage),
    error: usageErrorSummary(error),
  });
}

export function recordChatUsage(log, record) {
  if (record.ok) {
    log.info('chat completion usage', record);
  } else {
    log.error('chat completion usage', record);
  }
}

export function buildEmbeddingUsageRecord({
  ok,
  config = {},
  baseUrl = '',
  endpoint = '',
  payload = {},
  data = null,
  error = null,
  ms = 0,
  context = {},
} = {}) {
  return compactObject({
    type: 'embedding',
    ok: !!ok,
    source: context.source,
    provider: config.provider || null,
    model: payload.model || config.model || null,
    baseUrl,
    endpoint,
    ms,
    inputs: countEmbeddingInputs(payload),
    dimensions: embeddingDimensions(data),
    error: usageErrorSummary(error),
  });
}

export function recordEmbeddingUsage(log, record) {
  if (record.ok) {
    log.info('embedding usage', record);
  } else {
    log.error('embedding usage', record);
  }
}

export function buildImageGenerationUsageRecord({
  ok,
  config = {},
  payload = {},
  data = null,
  error = null,
  ms = 0,
  context = {},
} = {}) {
  return compactObject({
    type: 'image_generation',
    ok: !!ok,
    source: context.source,
    provider: config.provider || null,
    model: payload.model || config.model || null,
    ms,
    prompts: payload.contents || payload.prompt ? 1 : 0,
    candidates: Array.isArray(data?.candidates) ? data.candidates.length : undefined,
    images: countInlineImages(data),
    error: usageErrorSummary(error),
  });
}

export function recordImageGenerationUsage(log, record) {
  if (record.ok) {
    log.info('image generation usage', record);
  } else {
    log.error('image generation usage', record);
  }
}

function tokenUsage(usage) {
  if (!usage) return undefined;
  return compactObject({
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  });
}

export function usageErrorSummary(error) {
  if (!error) return undefined;
  return compactObject({
    name: error.name,
    message: error.status
      ? `Provider request failed (${error.status})`
      : 'Provider request failed',
    status: error.status,
    retryable: error.retryable,
  });
}

function countEmbeddingInputs(payload) {
  if (Array.isArray(payload.input)) return payload.input.length;
  if (Array.isArray(payload.texts)) return payload.texts.length;
  return payload.input || payload.texts ? 1 : 0;
}

function embeddingDimensions(data) {
  const openAiVector = data?.data?.[0]?.embedding;
  if (Array.isArray(openAiVector)) return openAiVector.length;
  const cohereVector = data?.embeddings?.float?.[0] || data?.embeddings?.[0];
  return Array.isArray(cohereVector) ? cohereVector.length : undefined;
}

function countInlineImages(data) {
  if (Array.isArray(data?.generatedImages)) return data.generatedImages.length;
  return (data?.candidates || []).reduce((total, candidate) => {
    const parts = candidate?.content?.parts || [];
    return total + parts.filter(part => part?.inlineData?.data).length;
  }, 0);
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  );
}
