/**
 * The "model strengths" drawing (diagram 14): what each AI family is best
 * at, in the drawing's own words. The auto-pick reads a task, finds which of these
 * strengths it needs, and picks the family that has it.
 *
 * Each strength has the words that give a task away, and the Arena benchmark
 * kind (Code, Writing, Data, Reasoning) its measured results come from.
 */
export const STRENGTHS = Object.freeze({
  vibecoding: { label: 'vibecoding', kind: 'Code', words: ['vibe ?code', 'build me', 'make me an? (app|game|site|page|tool)', 'prototype', 'landing page', 'mock ?up', 'quick app', 'little app', 'web ?app', 'component', 'react', 'html', 'css', 'code'] },
  uiDesign: { label: 'UI Design', kind: 'Writing', words: ['ui', 'ux', 'design', 'layout', 'look(s)? (good|better|nicer)', 'colou?rs?', 'font', 'button', 'screen', 'theme', 'style', 'figma', 'wireframe'] },
  brainstorming: { label: 'Brainstorming', kind: 'Writing', words: ['brainstorm', 'ideas?', 'names? for', 'come up with', 'what if', 'think of', 'riff', 'suggestions?'] },
  philosophising: { label: 'Philosophising', kind: 'Reasoning', words: ['philosoph', 'meaning of', 'ethic', 'moral', 'why do (we|people|humans)', 'consciousness', 'what is (life|truth|love)', 'purpose', 'big picture'] },
  strictCoding: { label: 'strict coding', kind: 'Code', words: ['strict', 'type ?safe', 'typescript', 'unit tests?', 'test suite', 'refactor', 'production', 'edge cases?', 'fix (the|this|a) bug', 'bug', 'stack ?trace', 'error', 'lint', 'regex', 'sql', 'algorithm', 'function'] },
  deepResearch: { label: 'Deep Research', kind: 'Data', words: ['deep research', 'research report', 'in[- ]depth', 'thorough', 'compare .* sources', 'literature', 'everything about', 'full report', 'market (study|research|analysis)', 'analy[sz]e'] },
  planning: { label: 'Planning', kind: 'Reasoning', words: ['plan', 'roadmap', 'step[- ]by[- ]step', 'schedule', 'milestones?', 'break (it|this) down', 'strategy', 'timeline', 'checklist', 'outline'] },
  stonewalling: { label: 'Stonewalling', kind: 'Reasoning', words: ['push back', 'poke holes', "devil'?s advocate", 'tell me (honestly|straight)', 'be (honest|brutal|harsh)', 'critique', 'stress[- ]test', 'say no', 'hold the line', 'negotiat', 'tear (it|this) apart'] },
  speed: { label: 'Speed', kind: 'Writing', words: ['quick(ly)?', 'fast', 'asap', 'right now', 'one line', 'short answer', 'tl;?dr', 'in a sentence', 'real quick'] },
  xAccess: { label: 'X Access', kind: 'Data', words: ['twitter', 'tweets?', 'on x\\b', 'x\\.com', 'trending', "what'?s (people|everyone) saying", 'viral', 'x posts?'] },
  research: { label: 'Research', kind: 'Data', words: ['research', 'look up', 'find out', 'search', 'sources?', 'latest', 'news', 'who is', 'what happened'] },
  imageGen: { label: 'Image Gen', kind: null, words: ['image', 'picture', 'photo', 'draw', 'logo', 'illustrat', 'poster', 'thumbnail', 'render', 'art\\b', 'icon'] },
  videoGen: { label: 'Video Gen', kind: null, words: ['video', 'clip', 'animation', 'animate', 'reel', 'tiktok', 'youtube short', 'movie'] },
  agenticSpeed: { label: 'Agentic Speed', kind: 'Code', words: ['agents?', 'automate', 'automation', 'workflow', 'run (it|this) for me', 'multi[- ]step', 'do (it|this) for me', 'in the background', 'pipeline', 'batch'] },
});

/** The four families, in the drawing's order, and the strengths written under each. */
export const FAMILIES = Object.freeze([
  { id: 'claude', name: 'Claude', strengths: ['vibecoding', 'uiDesign', 'brainstorming', 'philosophising'] },
  { id: 'chatgpt', name: 'ChatGPT', strengths: ['strictCoding', 'deepResearch', 'planning', 'stonewalling'] },
  { id: 'grok', name: 'Grok', strengths: ['speed', 'xAccess', 'research', 'brainstorming'] },
  { id: 'gemini', name: 'Gemini', strengths: ['deepResearch', 'imageGen', 'videoGen', 'agenticSpeed'] },
]);

/**
 * Where each family can be reached: its own provider first, then through an
 * OpenRouter key. `fast` is the model used when the task wants speed.
 */
export const FAMILY_ROUTES = Object.freeze({
  claude: [
    { provider: 'anthropic', model: 'claude-sonnet-5-5', fast: 'claude-haiku-5-5' },
    { provider: 'openrouter', model: 'anthropic/claude-sonnet-4.5' },
  ],
  chatgpt: [
    { provider: 'openai', model: 'gpt-4.1', fast: 'gpt-4.1-mini' },
    { provider: 'openrouter', model: 'openai/gpt-4.1' },
  ],
  grok: [
    { provider: 'xai', model: 'grok-4', fast: 'grok-4-fast' },
    { provider: 'openrouter', model: 'x-ai/grok-4' },
  ],
  gemini: [
    { provider: 'google', model: 'gemini-2.5-pro', fast: 'gemini-2.5-flash' },
    { provider: 'openrouter', model: 'google/gemini-2.5-pro', fast: 'google/gemini-2.5-flash' },
  ],
});

const PATTERNS = Object.fromEntries(Object.entries(STRENGTHS).map(([id, s]) => [
  id, s.words.map((w) => new RegExp(`(^|[^a-z])${w}`, 'i')),
]));

/**
 * Which strengths a task needs, strongest first. A strength scores one point
 * per give-away phrase found in the task; strengths with no hits are left out.
 */
export function classifyTask(text) {
  const task = String(text || '');
  if (!task.trim()) return [];
  return Object.entries(PATTERNS)
    .map(([id, patterns]) => ({ id, score: patterns.filter((p) => p.test(task)).length }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** The family a provider + model belongs to, or null (Cohere, Ollama and others). */
export function familyOf(provider, model = '') {
  for (const [family, routes] of Object.entries(FAMILY_ROUTES)) {
    if (routes.some((r) => r.provider === provider && r.provider !== 'openrouter')) return family;
  }
  if (provider === 'openrouter') {
    const prefix = String(model).split('/')[0];
    return { anthropic: 'claude', openai: 'chatgpt', 'x-ai': 'grok', google: 'gemini' }[prefix] || null;
  }
  return null;
}

export const familyName = (id) => FAMILIES.find((f) => f.id === id)?.name || id;
