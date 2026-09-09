import { getGeminiApiKey } from '../googleKeys.js';
import { getSecret } from '../secrets.js';
import {
  COHERE_DEFAULT_CHAT_MODEL,
  getCohereApiKey,
  getCohereChatBaseUrl,
} from './cohere.js';

export const DEFAULT_CHAT_MODEL = process.env.AI_MODEL || 'minimax-m2.5:cloud';
export const DEFAULT_CHAT_BASE_URL = normalizeBaseUrl(process.env.AI_BASE_URL || 'http://localhost:11434/v1');
export const OLLAMA_CHAT_MODEL_ALIASES = new Map([
  ['gemma4:35b', 'gemma4:31b-cloud'],
  ['gemma4:35b:cloud', 'gemma4:31b-cloud'],
]);

export function normalizeBaseUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

export function normalizeProviderName(modelProvider) {
  return String(modelProvider || '').trim().toLowerCase() || null;
}

export function getDefaultChatApiKey() {
  return getSecret('AI_API_KEY') || 'ollama';
}

const providerAdapters = {
  openrouter({ model }) {
    return {
      provider: 'openrouter',
      model,
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: getSecret('OPENROUTER_API_KEY') || '',
    };
  },
  cohere({ model }) {
    return {
      provider: 'cohere',
      model: model || COHERE_DEFAULT_CHAT_MODEL,
      baseUrl: getCohereChatBaseUrl(),
      apiKey: getCohereApiKey(),
    };
  },
  google({ model }) {
    return {
      provider: 'google',
      model,
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: getGeminiApiKey(getDefaultChatApiKey()),
    };
  },
  'google-native'({ model }) {
    return {
      provider: 'google-native',
      model,
      baseUrl: 'google-native',
      apiKey: getGeminiApiKey(getDefaultChatApiKey()),
    };
  },
  ollama({ model }) {
    return {
      provider: 'ollama',
      model: OLLAMA_CHAT_MODEL_ALIASES.get(model) || model,
      baseUrl: process.env.AI_BASE_URL || 'http://localhost:11434/v1',
      apiKey: 'ollama',
    };
  },
  moonshot({ provider, model }) {
    return {
      provider,
      model,
      baseUrl: process.env.MOONSHOT_BASE_URL || 'https://api.moonshot.cn/v1',
      apiKey: getSecret('MOONSHOT_API_KEY') || '',
    };
  },
  // OpenCode Zen: OpenAI-compatible gateway. Free models (e.g.
  // muse-spark-1.3-contributor-free) cost $0; key is OPENCODE_API_KEY.
  opencode({ model }) {
    return {
      provider: 'opencode',
      model,
      baseUrl: process.env.OPENCODE_ZEN_BASE_URL || 'https://opencode.ai/zen/v1',
      apiKey: getSecret('OPENCODE_API_KEY') || '',
    };
  },
};

export function resolveChatModelConfig({ modelProvider = null, modelName = null } = {}) {
  const provider = normalizeProviderName(modelProvider);
  const model = modelName || process.env.AI_MODEL || DEFAULT_CHAT_MODEL;

  if (provider === 'moonshot' || provider === 'kimi') {
    return normalizeConfig(providerAdapters.moonshot({ provider, model }));
  }
  if (providerAdapters[provider]) {
    return normalizeConfig(providerAdapters[provider]({ provider, model }));
  }

  return normalizeConfig({
    provider,
    model,
    baseUrl: process.env.AI_BASE_URL || DEFAULT_CHAT_BASE_URL,
    apiKey: getDefaultChatApiKey(),
  });
}

function normalizeConfig(config) {
  return {
    ...config,
    baseUrl: normalizeBaseUrl(config.baseUrl),
  };
}
