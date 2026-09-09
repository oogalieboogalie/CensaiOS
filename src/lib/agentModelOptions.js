// Single source of truth for agent model options.
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
    { value: 'minimax-m2.5:cloud', label: 'minimax-m2.5:cloud' },
    { value: 'qwen3-coder:latest', label: 'qwen3-coder:latest' },
    { value: 'qwen2.5-coder:latest', label: 'qwen2.5-coder:latest' },
    { value: 'llama3.1:8b', label: 'llama3.1:8b' },
    { value: 'mistral-small3.2:latest', label: 'mistral-small3.2:latest' },
  ],
  openrouter: [
    { value: 'openrouter/auto', label: 'openrouter/auto' },
    { value: 'openrouter/owl-alpha', label: 'openrouter/owl-alpha' },
    { value: 'google/gemini-2.0-flash-exp:free', label: 'google/gemini-2.0-flash-exp:free (Free)' },
    { value: 'meta-llama/llama-3-8b-instruct:free', label: 'meta-llama/llama-3-8b-instruct:free (Free)' },
    { value: 'deepseek/deepseek-chat', label: 'deepseek/deepseek-chat' },
    { value: 'deepseek/deepseek-r1', label: 'deepseek/deepseek-r1' },
    { value: 'anthropic/claude-sonnet-4.5', label: 'anthropic/claude-sonnet-4.5' },
    { value: 'openai/gpt-4.1', label: 'openai/gpt-4.1' },
    { value: 'x-ai/grok-4', label: 'x-ai/grok-4' },
    { value: 'google/gemini-2.5-pro', label: 'google/gemini-2.5-pro' },
    { value: 'google/gemini-2.5-flash', label: 'google/gemini-2.5-flash' },
  ],
  google: [
    { value: 'gemini-3.8-flash', label: 'gemini-3.8-flash' },
    { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
    { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
    { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash' },
    { value: 'gemini-1.5-flash', label: 'gemini-1.5-flash' },
  ],
  moonshot: [
    { value: 'kimi-k2.6', label: 'kimi-k2.6' },
    { value: 'kimi-k2-0711-preview', label: 'kimi-k2-0711-preview' },
    { value: 'moonshot-v1-128k', label: 'moonshot-v1-128k' },
    { value: 'moonshot-v1-32k', label: 'moonshot-v1-32k' },
    { value: 'moonshot-v1-8k', label: 'moonshot-v1-8k' },
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
