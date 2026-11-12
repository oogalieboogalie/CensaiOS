import { SHIPPED_DEFAULT_CHAT_MODEL } from '../../shared/models/defaultChatModel.js';

// Single source of truth for agent model options.
// Checked against each provider's model list on 2026-11-04: retired and superseded names
// (gpt-4o, gemini-1.5/2.0, grok-3, moonshot-v1…) were dropped. An agent saved
// on a dropped name still shows it as "(saved)" (modelOptionsFor below).
// Idea 2026-09-04: AgentData.js and agentDesigner/modelConfig.js both hardcoded
// MODEL_OPTIONS and drifted. Both editors now import from here.
export const MODEL_OPTIONS = {
  cohere: [
    { value: 'north-mini-code-1-0', label: 'North Mini Code 1.0 · 256K · Tool Use' },
    { value: 'command-a-plus-05-2026', label: 'Command A+' },
    { value: 'command-a-03-2025', label: 'Command A' },
    { value: 'command-a-reasoning-08-2025', label: 'Command A Reasoning' },
    { value: 'command-a-translate-08-2025', label: 'Command A Translate' },
    { value: 'command-a-vision-07-2025', label: 'Command A Vision' },
    { value: 'command-r-plus-08-2024', label: 'Command R+' },
    { value: 'command-r-08-2024', label: 'Command R' },
    { value: 'command-r7b-12-2024', label: 'Command R7B' },
  ],
  ollama: [
    { value: SHIPPED_DEFAULT_CHAT_MODEL, label: SHIPPED_DEFAULT_CHAT_MODEL },
    { value: 'qwen3-coder:latest', label: 'qwen3-coder:latest' },
    { value: 'qwen2.5-coder:latest', label: 'qwen2.5-coder:latest' },
    { value: 'llama3.1:8b', label: 'llama3.1:8b' },
    { value: 'mistral-small3.2:latest', label: 'mistral-small3.2:latest' },
  ],
  openrouter: [
    { value: 'openrouter/auto', label: 'openrouter/auto' },
    { value: 'anthropic/claude-sonnet-5.5', label: 'anthropic/claude-sonnet-5.5' },
    { value: 'anthropic/claude-haiku-5.5', label: 'anthropic/claude-haiku-5.5' },
    { value: 'openai/gpt-6.1-sol', label: 'openai/gpt-6.1-sol' },
    { value: 'openai/gpt-6-luna', label: 'openai/gpt-6-luna' },
    { value: 'google/gemini-4-argon', label: 'google/gemini-4-argon' },
    { value: 'moonshotai/kimi-k3.1-pro', label: 'moonshotai/kimi-k3.1-pro' },
    { value: 'deepseek/deepseek-v4.1-flash-1017', label: 'deepseek/deepseek-v4.1-flash-1017' },
    { value: 'z-ai/glm-5.3-prime', label: 'z-ai/glm-5.3-prime' },
    { value: 'qwen/qwen3.8-max-prime', label: 'qwen/qwen3.8-max-prime' },
    { value: 'nvidia/nemotron-3.5-super-vl:free', label: 'nvidia/nemotron-3.5-super-vl:free (Free)' },
  ],
  anthropic: [
    { value: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 · images · PDFs · tools' },
    { value: 'claude-opus-5-5', label: 'Claude Opus 5.5 · images · PDFs · tools' },
    { value: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 · images · PDFs · tools' },
    { value: 'claude-fable-5-1', label: 'Claude Fable 5.1 · images · PDFs · tools' },
  ],
  xai: [
    { value: 'grok-4.7', label: 'grok-4.7 · images · tools' },
    { value: 'grok-4.6', label: 'grok-4.6 · images · tools' },
    { value: 'grok-4.3', label: 'grok-4.3 · images · tools · 1M context' },
    { value: 'grok-build-0.1', label: 'grok-build-0.1 · coding · tools' },
  ],
  openai: [
    { value: 'gpt-6.1-sol', label: 'gpt-6.1-sol · images · PDFs' },
    { value: 'gpt-6.1-terra', label: 'gpt-6.1-terra · images · PDFs' },
    { value: 'gpt-6-astra', label: 'gpt-6-astra · images · PDFs' },
    { value: 'gpt-6-luna', label: 'gpt-6-luna · images · PDFs · low cost' },
    { value: 'gpt-4o-audio-preview', label: 'gpt-4o-audio-preview · audio in' },
  ],
  google: [
    { value: 'gemini-3.8-flash', label: 'gemini-3.8-flash' },
    { value: 'gemini-4-argon', label: 'gemini-4-argon' },
    { value: 'gemini-3.6-flash', label: 'gemini-3.6-flash' },
    { value: 'gemini-3.5-flash-lite', label: 'gemini-3.5-flash-lite' },
    { value: 'gemini-3.1-pro-preview', label: 'gemini-3.1-pro-preview · preview' },
  ],
  moonshot: [
    { value: 'kimi-k3.1-pro', label: 'kimi-k3.1-pro' },
    { value: 'kimi-k3.1-pro-highspeed', label: 'kimi-k3.1-pro-highspeed' },
    { value: 'kimi-k2.6', label: 'kimi-k2.6 · images' },
    { value: 'kimi-k2.5', label: 'kimi-k2.5 · images' },
  ],
  opencode: [
    { value: 'muse-spark-1.3-contributor-free', label: 'Muse Spark 1.3 · Free' },
    { value: 'muse-spark-1.2-contributor-free', label: 'Muse Spark 1.2 · Free' },
    { value: 'mimo-v2.5-free', label: 'MiMo V2.5 · Free' },
    { value: 'ling-3.0-flash-fin-free', label: 'Ling 3.0 Flash · Free' },
    { value: 'nemotron-3-ultra-free', label: 'Nemotron 3 Ultra · Free' },
    { value: 'nemotron-3.5-lightning-free', label: 'Nemotron 3.5 Lightning · Free' },
    { value: 'big-pickle', label: 'Big Pickle · Free' },
    { value: 'minimax-m2.5', label: 'MiniMax M2.5' },
    { value: 'kimi-k2.5', label: 'Kimi K2.5' },
  ],
  zai: [
    { value: 'glm-5.3', label: 'glm-5.3 · Flagship' },
    { value: 'glm-5.3-air', label: 'glm-5.3-air · Light' },
    { value: 'glm-5.3-flash', label: 'glm-5.3-flash · Fast' },
  ],
};

export function defaultModelForProvider(provider) {
  return MODEL_OPTIONS[provider]?.[0]?.value || '';
}

export function supportedProvider(provider) {
  return MODEL_OPTIONS[provider] ? provider : 'ollama';
}

export function modelOptionsFor(provider, currentModel) {
  const options = MODEL_OPTIONS[provider] || [];
  if (currentModel && !options.some(option => option.value === currentModel)) {
    return [{ value: currentModel, label: `${currentModel} (saved)` }, ...options];
  }
  return options;
}
