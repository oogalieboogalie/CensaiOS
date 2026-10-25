// Rough list prices, US dollars per million tokens: [input, output].
//
// These turn the token counts censaiOS sees into an ESTIMATE of what a call
// cost. Providers change prices, discount cached input and bill some models
// differently, so the window always labels these numbers as estimates. A
// model that is not listed shows tokens only, never a made-up price.
// Claude prices: Anthropic's first-party list, checked 2026-10-20.

const PRICES = Object.freeze({
  'claude-fable-5': [10, 50],
  'claude-mythos-5': [10, 50],
  'claude-opus-5-5': [4, 20],
  'claude-opus-5': [5, 25],
  'claude-opus-4-8': [5, 25],
  'claude-opus-4-7': [5, 25],
  'claude-opus-4-6': [5, 25],
  'claude-opus-4-5': [5, 25],
  'claude-opus-4-1': [15, 75],
  'claude-opus-4': [15, 75],
  'claude-sonnet-5': [2, 10],
  'claude-sonnet-4': [3, 15],
  'claude-3-7-sonnet': [3, 15],
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-haiku-4-5': [1, 5],
  'claude-3-5-haiku': [0.8, 4],
  'gpt-5-nano': [0.05, 0.4],
  'gpt-5-mini': [0.25, 2],
  'gpt-5': [1.25, 10],
  'gpt-4.1-nano': [0.1, 0.4],
  'gpt-4.1-mini': [0.4, 1.6],
  'gpt-4.1': [2, 8],
  'gpt-4o-mini': [0.15, 0.6],
  'gpt-4o': [2.5, 10],
  'o4-mini': [1.1, 4.4],
  'o3-mini': [1.1, 4.4],
  'o3': [2, 8],
  'gemini-2.5-flash-lite': [0.1, 0.4],
  'gemini-2.5-flash': [0.3, 2.5],
  'gemini-2.5-pro': [1.25, 10],
  'gemini-2.0-flash': [0.1, 0.4],
  'grok-code-fast': [0.2, 1.5],
  'grok-4-fast': [0.2, 0.5],
  'grok-4': [3, 15],
  'grok-3-mini': [0.3, 0.5],
  'grok-3': [3, 15],
});

const LOCAL_PROVIDERS = new Set(['ollama', 'local', 'lmstudio']);
const PREFIXES = Object.keys(PRICES).sort((a, b) => b.length - a.length);

/** The listed price for a model, or null. "anthropic/claude-sonnet-4" works too. */
export function priceFor(model) {
  const name = String(model || '').toLowerCase().split('/').pop().replace(/^models\//, '');
  const prefix = PREFIXES.find((p) => name === p || name.startsWith(`${p}-`) || name.startsWith(`${p}.`) || name.startsWith(`${p}:`));
  if (!prefix) return null;
  // "gpt-5-pro" or "o3-pro" cost many times their base model: no price beats a wrong one.
  if (/(^|[-.:])pro($|[-.:])/.test(name.slice(prefix.length)) && !prefix.includes('pro')) return null;
  return PRICES[prefix];
}

/** Estimated dollars for one call; 0 for a model on your own computer; null when unknown. */
export function estimateCost({ provider, model, tokensIn = 0, tokensOut = 0 }) {
  if (LOCAL_PROVIDERS.has(String(provider || '').toLowerCase())) return 0;
  const price = priceFor(model);
  if (!price) return null;
  return (tokensIn * price[0] + tokensOut * price[1]) / 1_000_000;
}
