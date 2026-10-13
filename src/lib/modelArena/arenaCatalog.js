// Model arena data: which models can race, what they cost, and the
// one-click sample jobs. Pure data and math, so it can be tested.
import { MODEL_OPTIONS } from '../agentModelOptions.js';

export const MAX_LANES = 4;

export const PROVIDER_LABELS = Object.freeze({
  anthropic: 'Claude', google: 'Gemini', openai: 'OpenAI', openrouter: 'OpenRouter', ollama: 'Ollama (this computer)',
  xai: 'Grok', moonshot: 'Kimi', opencode: 'OpenCode Zen', zai: 'Z.ai', cohere: 'Cohere',
});

// "Claude Haiku 5.5" and "gemini-3.8-flash" already say whose they are.
function modelLabel(provider, name) {
  const brand = PROVIDER_LABELS[provider];
  return name.toLowerCase().includes(brand.split(' ')[0].toLowerCase()) ? name : `${brand} · ${name}`;
}

/** Every model the arena offers, as { id, provider, model, label }. */
export function arenaModels() {
  return Object.entries(MODEL_OPTIONS)
    .filter(([provider]) => PROVIDER_LABELS[provider])
    .flatMap(([provider, options]) => options.map((option) => ({
      id: `${provider}:${option.value}`,
      provider,
      model: option.value,
      label: modelLabel(provider, option.label.split(' · ')[0]),
    })));
}

// Alex's first race: Gemini 3.8 Flash against Claude Haiku 5.5.
export const DEFAULT_LANES = Object.freeze([
  { provider: 'google', model: 'gemini-3.8-flash' },
  { provider: 'anthropic', model: 'claude-haiku-5-5' },
]);

// What "Add a model" offers first, in order, skipping ones already racing.
export const ADD_SUGGESTIONS = Object.freeze([
  'openai:gpt-4.1-mini', 'google:gemini-2.5-flash', 'anthropic:claude-sonnet-5-5', 'ollama:qwen3-coder:latest',
]);

// List prices in US dollars per million tokens: [input, output]. They are
// estimates for comparing models; the provider's own bill is the real cost.
// Checked 2026-10-12. Gemini 3.8 Flash is at its launch price until the end
// of 2026 (it doubles to 1.50 / 7.50 on 2027-01-01).
export const PRICES = Object.freeze({
  'anthropic:claude-haiku-5-5': [0.10, 0.50],
  'anthropic:claude-sonnet-5-5': [2, 10],
  'anthropic:claude-opus-5-5': [4, 20],
  'google:gemini-3.8-flash': [0.75, 3.75],
  'google:gemini-2.5-flash': [0.30, 2.50],
  'google:gemini-2.5-pro': [1.25, 10],
  'openai:gpt-4.1': [2, 8],
  'openai:gpt-4.1-mini': [0.40, 1.60],
  'openai:gpt-4o-mini': [0.15, 0.60],
});

/** Estimated dollars for one reply, or null when no price is on file. */
export function estimateCost(provider, model, usage) {
  if (!usage) return null;
  if (provider === 'ollama') return 0;
  if (/:free$|-free$/.test(model)) return 0;
  const price = PRICES[`${provider}:${model}`];
  if (!price) return null;
  return ((usage.input || 0) * price[0] + (usage.output || 0) * price[1]) / 1_000_000;
}

export function formatCost(cost) {
  if (cost === null || cost === undefined) return 'no price on file';
  if (cost === 0) return 'free';
  if (cost < 0.0001) return '< $0.0001';
  return `$${cost.toFixed(cost < 0.01 ? 4 : 3)}`;
}

export function formatMs(ms) {
  if (ms === null || ms === undefined) return '—';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** Output tokens a second, counted from the first word to the last. */
export function tokensPerSecond(result) {
  const { usage, firstTokenMs, totalMs } = result || {};
  const span = (totalMs ?? 0) - (firstTokenMs ?? 0);
  if (!usage?.output || span <= 0) return null;
  return Math.round(usage.output / (span / 1000));
}

// One-click jobs shaped like the work a fast scout model does for a main
// agent: read and map, then point at the exact spot to change.
const SAMPLE_REPO = `src/lib/cart.js
  export function addItem(cart, item) { return { ...cart, items: [...cart.items, item] }; }
  export function total(cart) { return cart.items.reduce((sum, i) => sum + i.price * i.qty, 0); }
src/lib/tax.js
  (imports total from cart.js)
  export const TAX_RATE = 0.07;
  export function withTax(cart) { return total(cart) * (1 + TAX_RATE); }
src/components/Checkout.jsx
  (imports withTax from lib/tax.js)
  export function Checkout({ cart }) { return <p>Total: {withTax(cart).toFixed(2)}</p>; }
server/routes/orders.js
  (imports withTax from src/lib/tax.js)
  router.post('/orders', (req, res) => res.json({ charged: withTax(req.body.cart) }));`;

export const SAMPLE_TASKS = Object.freeze([
  {
    id: 'map',
    label: 'Map a repo',
    system: 'You are a scout for a larger coding agent. Be exact and brief. No prose before the answer.',
    prompt: `Map how these files connect. For each file, list what it exports and which files use it. Then say which files would break if total() in cart.js changed its name.\n\n${SAMPLE_REPO}`,
  },
  {
    id: 'pinpoint',
    label: 'Find the exact line',
    system: 'You are a scout for a larger coding agent. Answer only with file, line number and column, then one sentence.',
    prompt: `The tax rate must change from 7% to 8.25%. Give the exact file, line and column of the one place to edit (count lines from 1 inside each file block, the path line is not counted).\n\n${SAMPLE_REPO}`,
  },
  {
    id: 'ripple',
    label: 'What else changes',
    system: 'You are a scout for a larger coding agent. Reply as a short list of file:line items.',
    prompt: `We want Checkout to show tax separately from the subtotal. List every place that has to change, and every place that must NOT change, as file:line with a few words each.\n\n${SAMPLE_REPO}`,
  },
  {
    id: 'route',
    label: 'Sort these jobs',
    system: 'You route work between a fast small model and a large careful model. Reply as JSON only.',
    prompt: 'Sort each job into "small" or "large" and give one reason each, as a JSON array of {job, size, reason}:\n1. Rename a variable across 3 files\n2. Design the database for a new billing system\n3. Find which file defines withTax\n4. Write release notes from 40 commit messages\n5. Decide whether to split a 900-line component and how',
  },
]);

/**
 * Which lanes won what, once at least two have finished: fastest first
 * word, fastest finish and cheapest. Returns one array of labels per lane.
 */
export function laneBadges(lanes, results) {
  const badges = lanes.map(() => []);
  const done = results
    .map((result, index) => ({ result, index, lane: lanes[index] }))
    .filter(({ result, lane }) => lane && result?.status === 'done');
  if (done.length < 2) return badges;
  const best = (label, valueOf) => {
    const scored = done.map((entry) => ({ ...entry, value: valueOf(entry) })).filter((entry) => Number.isFinite(entry.value));
    if (scored.length < 2) return;
    const min = Math.min(...scored.map((entry) => entry.value));
    scored.filter((entry) => entry.value === min).forEach((entry) => badges[entry.index].push(label));
  };
  best('First to answer', ({ result }) => result.firstTokenMs);
  best('First to finish', ({ result }) => result.totalMs);
  best('Cheapest', ({ result, lane }) => estimateCost(lane.provider, lane.model, result.usage) ?? NaN);
  return badges;
}
