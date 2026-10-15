import { getGeminiApiKey } from '../googleKeys.js';
import { getSecret } from '../secrets.js';
import {
  COHERE_DEFAULT_CHAT_MODEL,
  getCohereApiKey,
  getCohereChatBaseUrl,
} from './cohere.js';
import { ANTHROPIC_DEFAULT_BASE_URL } from './anthropicChat.js';
import { anthropicModelFor } from './anthropicRequest.js';
import { isSubscriptionToken } from '../security/envKeys.js';

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

// A Claude subscription token (sk-ant-oat) in .env is never used as a key.
function serverAnthropicKey() {
  const key = getSecret('ANTHROPIC_API_KEY');
  return isSubscriptionToken('anthropic', key) ? '' : key;
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
  openai({ model }) {
    return {
      provider: 'openai',
      model,
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      apiKey: getSecret('OPENAI_API_KEY') || '',
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
      baseUrl: process.env.GEMINI_OPENAI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai',
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
  // Native Claude through the Messages API (BYOK key or ANTHROPIC_API_KEY).
  anthropic({ model }) {
    return {
      provider: 'anthropic',
      model: anthropicModelFor(model),
      baseUrl: process.env.ANTHROPIC_BASE_URL || ANTHROPIC_DEFAULT_BASE_URL,
      apiKey: serverAnthropicKey(),
    };
  },
  // xAI Grok: OpenAI-compatible chat completions (BYOK key or XAI_API_KEY).
  xai({ model }) {
    return {
      provider: 'xai',
      model: model || 'grok-4',
      baseUrl: process.env.XAI_BASE_URL || 'https://api.x.ai/v1',
      apiKey: getSecret('XAI_API_KEY') || '',
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
  // Z.ai (Zhipu): OpenAI-compatible endpoint for the GLM family.
  // Key is ZAI_API_KEY (server) or a per-user BYOK vault key.
  zai({ model }) {
    return {
      provider: 'zai',
      model,
      baseUrl: process.env.ZAI_BASE_URL || 'https://api.z.ai/api/paas/v4',
      apiKey: getSecret('ZAI_API_KEY') || '',
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

  if (provider === 'claude') {
    return normalizeConfig(providerAdapters.anthropic({ provider: 'anthropic', model }));
  }
  // A Grok agent with no model named gets Grok, not the local default model.
  if (provider === 'xai' || provider === 'grok' || provider === 'x-ai') {
    return normalizeConfig(providerAdapters.xai({ provider: 'xai', model: modelName }));
  }
  if (provider === 'moonshot' || provider === 'kimi') {
    return normalizeConfig(providerAdapters.moonshot({ provider, model }));
  }
  if (provider === 'glm' || provider === 'z.ai') {
    return normalizeConfig(providerAdapters.zai({ provider: 'zai', model }));
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
