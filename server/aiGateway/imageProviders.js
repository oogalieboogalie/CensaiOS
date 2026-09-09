import { getGeminiApiKey } from '../googleKeys.js';
import { normalizeProviderName } from './providers.js';

export const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';

export function resolveImageGenerationModelConfig({ modelProvider = null, modelName = null } = {}) {
  return {
    provider: normalizeProviderName(modelProvider || process.env.IMAGE_PROVIDER || 'google'),
    model: modelName || process.env.IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
    apiKey: getGeminiApiKey(),
  };
}
