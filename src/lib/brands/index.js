// Third-party brand marks, in one place. Every service the board names
// (window kinds, model providers, coding CLIs, search engines) resolves to a
// brand key here; BrandIcon.jsx draws it.
//
// Marks come from Simple Icons (brandMarks.js, CC0). Brands without a usable
// official mark there get a monogram: their initials in a plain outlined tile
// drawn in the board's own ink, so no logo is invented or borrowed.
//
// Logo rules we follow for every brand: the mark is shown whole, never
// redrawn, stretched or recoloured. It renders in the current text colour
// (the monochrome version brands allow) and, where a surface asks for it, in
// the brand's own colour. It keeps clear space around it (BrandIcon pads it).

import { BRAND_MARKS, SIMPLE_ICONS_VERSION } from './brandMarks.js';

export { SIMPLE_ICONS_VERSION };

// Brands Simple Icons doesn't carry. `monogram` is what the tile shows.
const MONOGRAMS = {
  openai: { title: 'OpenAI', monogram: 'AI' },
  cohere: { title: 'Cohere', monogram: 'Co' },
  groq: { title: 'Groq', monogram: 'Gq' },
  xai: { title: 'xAI', monogram: 'xA' },
  together: { title: 'Together AI', monogram: 'To' },
  tavily: { title: 'Tavily', monogram: 'Tv' },
  bing: { title: 'Bing', monogram: 'B' },
  yandex: { title: 'Yandex', monogram: 'Ya' },
  mailcow: { title: 'Mailcow', monogram: 'Mc' },
  slack: { title: 'Slack', monogram: 'Sl' },
  codex: { title: 'Codex', monogram: 'Cx' },
  zai: { title: 'Z.ai', monogram: 'Z' },
  elevenlabs: { title: 'ElevenLabs', monogram: '11' },
};

// Which shelf a brand sits on in the brand sheet (docs/brand/third-party.md).
export const BRAND_CATEGORIES = Object.freeze({
  'AI and agents': ['anthropic', 'claude', 'openai', 'codex', 'googlegemini', 'ollama', 'openrouter', 'cohere', 'mistralai', 'deepseek', 'groq', 'xai', 'together', 'huggingface', 'perplexity', 'moonshotai', 'zai', 'opencode', 'githubcopilot', 'lmstudio', 'elevenlabs'],
  'Build and ship': ['github', 'gitlab', 'docker', 'kubernetes', 'vercel', 'cloudflare', 'netlify', 'linear', 'n8n', 'figma', 'googlejules', 'postgresql', 'redis', 'supabase', 'stripe', 'notion', 'mailcow', 'godotengine', 'threedotjs'],
  'Chat': ['discord', 'slack', 'telegram', 'whatsapp'],
  'Media': ['youtube', 'youtubemusic', 'youtubeshorts', 'spotify', 'soundcloud', 'applemusic', 'tiktok', 'twitch', 'vimeo'],
  'Search': ['google', 'duckduckgo', 'tavily', 'searxng', 'torproject', 'brave', 'bing', 'startpage', 'kagi', 'ecosia', 'mojeek', 'qwant', 'wikipedia', 'swisscows', 'metager', 'yandex'],
});

// Short names for keys whose Simple Icons title is long or odd on a tile.
const ALIASES = { gemini: 'googlegemini', google_gemini: 'googlegemini', jules: 'googlejules', tor: 'torproject', claudecode: 'claude', moonshot: 'moonshotai', kimi: 'moonshotai', glm: 'zai', 'z.ai': 'zai', mistral: 'mistralai', threejs: 'threedotjs', godot: 'godotengine', youtube_music: 'youtubemusic' };

// Records are built once so the same key always returns the same object
// (window chrome memoises on it).
const RECORDS = new Map();

/** The brand record for a key: { key, title, hex?, path?, monogram?, guidelines? }, or null. */
export function brandFor(key) {
  if (!key) return null;
  const k = ALIASES[String(key).toLowerCase()] || String(key).toLowerCase();
  if (!RECORDS.has(k)) {
    const base = BRAND_MARKS[k] || MONOGRAMS[k];
    RECORDS.set(k, base ? Object.freeze({ key: k, ...base }) : null);
  }
  return RECORDS.get(k);
}

/** Every brand key the board knows, marks and monograms. */
export const BRAND_KEYS = Object.freeze([...Object.keys(BRAND_MARKS), ...Object.keys(MONOGRAMS)]);

// Window kinds that are one third-party service. Their Add-menu row and
// window header show that service's mark instead of a generic glyph.
export const BRAND_BY_KIND = Object.freeze({
  containers: 'docker',
  kubernetes: 'kubernetes',
  mailcow: 'mailcow',
  n8n: 'n8n',
  youtube: 'youtube',
  shorts: 'youtubeshorts',
  figma: 'figma',
  linear: 'linear',
  githubConsole: 'github',
  julesTasks: 'googlejules',
  leadHound: 'tavily',
  research: 'tavily',
  ollama: 'ollama',
  whatsapp: 'whatsapp',
});

// Model providers (byokProviders.js, agentModelOptions.js ids).
export const PROVIDER_BRAND = Object.freeze({
  anthropic: 'anthropic', openai: 'openai', google: 'googlegemini', gemini: 'googlegemini',
  openrouter: 'openrouter', ollama: 'ollama', cohere: 'cohere', mistral: 'mistralai',
  deepseek: 'deepseek', groq: 'groq', xai: 'xai', together: 'together', moonshot: 'moonshotai',
  zai: 'zai', opencode: 'opencode', huggingface: 'huggingface', perplexity: 'perplexity', lmstudio: 'lmstudio',
  elevenlabs: 'elevenlabs',
});

// Coding CLIs in the Agent Console. Codex is OpenAI's; Simple Icons has no
// OpenAI mark, so it keeps a monogram.
export const CLI_BRAND = Object.freeze({ claudecode: 'claude', codex: 'codex', gemini: 'googlegemini', opencode: 'opencode', copilot: 'githubcopilot' });

/** The brand a window shows in its header, or null for the board's own windows. */
export function windowBrand(win) {
  if (!win) return null;
  if (win.kind === 'searchEngine') return brandFor(win.engine || 'duckduckgo');
  return brandFor(BRAND_BY_KIND[win.kind]);
}
