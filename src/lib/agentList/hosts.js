// Where an agent in the Agent list runs, for the small computer icon on its
// row: a model on the censaiOS computer, a cloud model, the browser (built
// modules), another censaiOS, or a service on the web. Pure.

const LOCAL_PROVIDERS = new Set(['ollama', 'local', 'lmstudio', 'llamacpp', 'llama.cpp', 'vllm']);

const PROVIDER_NAMES = {
  anthropic: 'Anthropic', claude: 'Anthropic', openai: 'OpenAI', google: 'Google', gemini: 'Google',
  xai: 'xAI', grok: 'xAI', openrouter: 'OpenRouter', groq: 'Groq', deepseek: 'DeepSeek', mistral: 'Mistral',
  together: 'Together', cohere: 'Cohere', perplexity: 'Perplexity', moonshot: 'Moonshot', zai: 'Z.ai',
  ollama: 'Ollama', lmstudio: 'LM Studio', local: 'a local model',
};

export function providerName(provider) {
  const key = String(provider || '').trim().toLowerCase();
  if (!key) return '';
  return PROVIDER_NAMES[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

/** A chat agent: where its model runs. */
export function chatHost(agent) {
  const provider = String(agent?.model_provider || '').trim().toLowerCase();
  const model = String(agent?.model_name || '').trim();
  const named = providerName(provider);
  if (LOCAL_PROVIDERS.has(provider)) {
    return { id: 'local', label: `Runs on the censaiOS computer (${named}${model ? `, ${model}` : ''})` };
  }
  if (provider) return { id: 'cloud', label: `Runs on a cloud model (${named}${model ? `, ${model}` : ''})` };
  return { id: 'default', label: 'Runs on the board\'s default model' };
}

/** A window on the board that is not a chat agent. */
export function windowHost(kind) {
  if (kind === 'agentConsole') return { id: 'local', label: 'Runs on the censaiOS computer, in its own copy of the code' };
  if (kind === 'module') return { id: 'browser', label: 'Runs in the browser of whoever has the board open' };
  return { id: 'cloud', label: 'Searches the web with Tavily' };
}

const NETWORK_HOSTS = {
  censai: { id: 'remote', label: 'Runs on another censaiOS computer' },
  a2a: { id: 'web', label: 'Runs on the web (an A2A agent)' },
  n8n: { id: 'web', label: 'Runs on the web (an n8n chat)' },
};

/** An agent added from somewhere else. */
export function networkHost(source) {
  return NETWORK_HOSTS[source] || { id: 'web', label: 'Runs on the web' };
}
