import { getSecret } from '../secrets.js';
import { normalizeBaseUrl, normalizeProviderName } from './providers.js';

export const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text';
export const DEFAULT_COHERE_EMBEDDING_MODEL = 'embed-v4.0';

export function getCohereEmbeddingApiKey() {
  return getSecret('COHERE_NON_COMMERCIAL_KEY') || getSecret('COHERE_PAID_API_KEY') || getSecret('COHERE_API_KEY') || getSecret('EMBEDDING_API_KEY') || '';
}

export function resolveEmbeddingModelConfig({ modelProvider = null, modelName = null } = {}) {
  const explicitProvider = normalizeProviderName(modelProvider || process.env.EMBEDDING_PROVIDER);
  const model = modelName || process.env.EMBEDDING_MODEL || defaultEmbeddingModel(explicitProvider);
  const inferredProvider = explicitProvider || inferEmbeddingProvider(model);

  if (inferredProvider === 'cohere') {
    return {
      provider: 'cohere',
      model: model || DEFAULT_COHERE_EMBEDDING_MODEL,
      baseUrl: normalizeBaseUrl(process.env.COHERE_BASE_URL || 'https://api.cohere.com'),
      endpoint: '/v2/embed',
      apiKey: getCohereEmbeddingApiKey(),
      headers: { 'X-Client-Name': 'homebase' },
    };
  }

  return {
    provider: inferredProvider || 'openai-compatible',
    model: model || DEFAULT_EMBEDDING_MODEL,
    baseUrl: normalizeBaseUrl(process.env.EMBEDDING_BASE_URL || process.env.AI_BASE_URL || 'http://localhost:11434/v1'),
    endpoint: '/embeddings',
    apiKey: getSecret('AI_API_KEY') || 'ollama',
  };
}

function inferEmbeddingProvider(model) {
  return getCohereEmbeddingApiKey() && String(model || '').startsWith('embed-')
    ? 'cohere'
    : 'openai-compatible';
}

function defaultEmbeddingModel(provider) {
  return provider === 'cohere' ? DEFAULT_COHERE_EMBEDDING_MODEL : DEFAULT_EMBEDDING_MODEL;
}
