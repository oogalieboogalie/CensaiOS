// Shared mapping for Import agent: turns another platform's model names and
// tool names into what a board agent understands. Pure, no fetch, no store;
// used by the browser import card and by the server's account import.

export const PLATFORMS = Object.freeze({
  'google-adk': { id: 'google-adk', label: 'Google ADK' },
  openai: { id: 'openai', label: 'OpenAI' },
  claude: { id: 'claude', label: 'Claude' },
  grok: { id: 'grok', label: 'Grok (xAI)' },
  elevenlabs: { id: 'elevenlabs', label: 'ElevenLabs' },
});

export const PROVIDER_LABELS = Object.freeze({
  google: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
  xai: 'xAI (Grok)',
  openrouter: 'OpenRouter',
  cohere: 'Cohere',
  moonshot: 'Moonshot',
  ollama: 'Ollama',
  opencode: 'OpenCode Zen',
  zai: 'Z.ai (GLM)',
});

export const DEFAULT_MODELS = Object.freeze({
  google: 'gemini-2.5-flash',
  openai: 'gpt-4.1',
  anthropic: 'claude-sonnet-5-5',
  xai: 'grok-4',
});

// Claude Code subagents name models by family ("sonnet", "opus", "haiku").
const CLAUDE_ALIASES = Object.freeze({
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
  haiku: 'claude-haiku-5-5',
});

function lower(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Work out which board provider runs a model the other platform named.
 * @param {string} rawModel  e.g. "gemini-2.5-flash", "openai/gpt-4o", "sonnet"
 * @param {string} fallbackProvider provider to use when the name says nothing
 * @returns {{provider:string, model:string, guessed:boolean}}
 */
export function resolveModel(rawModel, fallbackProvider) {
  let model = String(rawModel || '').trim();
  const m = lower(model);
  if (!m || m === 'inherit' || m === 'custom-llm') {
    return { provider: fallbackProvider, model: DEFAULT_MODELS[fallbackProvider] || '', guessed: true };
  }
  if (CLAUDE_ALIASES[m]) return { provider: 'anthropic', model: CLAUDE_ALIASES[m], guessed: false };

  // LiteLLM style "vendor/model" (ADK's LiteLlm wrapper, OpenRouter ids).
  const slash = m.indexOf('/');
  if (slash > 0) {
    const vendor = m.slice(0, slash);
    const rest = model.slice(slash + 1);
    if (vendor === 'openai') return { provider: 'openai', model: rest, guessed: false };
    if (vendor === 'anthropic') return { provider: 'anthropic', model: rest, guessed: false };
    if (vendor === 'gemini' || vendor === 'google' || vendor === 'vertex_ai') return { provider: 'google', model: rest, guessed: false };
    if (vendor === 'xai' || vendor === 'x-ai') return { provider: 'xai', model: rest, guessed: false };
    if (vendor === 'zai' || vendor === 'z-ai') return { provider: 'zai', model: rest, guessed: false };
    if (vendor === 'ollama' || vendor === 'ollama_chat') return { provider: 'ollama', model: rest, guessed: false };
    return { provider: 'openrouter', model, guessed: false };
  }

  if (m.startsWith('gemini')) return { provider: 'google', model, guessed: false };
  if (m.startsWith('claude')) return { provider: 'anthropic', model, guessed: false };
  if (m.startsWith('grok')) return { provider: 'xai', model, guessed: false };
  if (/^(gpt|o\d|chatgpt|davinci)/.test(m)) return { provider: 'openai', model, guessed: false };
  if (m.startsWith('command')) return { provider: 'cohere', model, guessed: false };
  if (m.startsWith('kimi') || m.startsWith('moonshot')) return { provider: 'moonshot', model, guessed: false };
  if (m.startsWith('glm')) return { provider: 'zai', model, guessed: false };
  return { provider: fallbackProvider, model, guessed: true };
}

// Foreign tool name (lowercased) → board tool names. Anything not listed here
// is reported on the import card as "did not carry over".
const TOOL_MAP = Object.freeze({
  // web search
  google_search: ['web_search'],
  googlesearch: ['web_search'],
  web_search: ['web_search'],
  web_search_preview: ['web_search'],
  websearch: ['web_search'],
  websearchtool: ['web_search'],
  vertex_ai_search: ['web_search'],
  x_search: ['web_search'],
  // reading pages
  url_context: ['web_extract'],
  load_web_page: ['web_extract'],
  webfetch: ['web_extract'],
  web_fetch: ['web_extract'],
  browse_page: ['web_extract'],
  // reading project files (read-only on the board)
  read: ['project_read'],
  grep: ['project_read'],
  glob: ['project_file_outline', 'project_list'],
  ls: ['project_list'],
  // memory
  load_memory: ['recall'],
  preload_memory: ['recall'],
  memory: ['remember', 'recall'],
  // handing work to another agent
  agenttool: ['request_agent_help'],
  agent_tool: ['request_agent_help'],
  task: ['request_agent_help'],
  transfer_to_agent: ['request_agent_help'],
  // video
  veo: ['make_video', 'video_status'],
  generate_video: ['make_video', 'video_status'],
  make_video: ['make_video', 'video_status'],
});

// Tools we know but deliberately leave behind, with the plain reason.
const KNOWN_NOT_CARRIED = Object.freeze({
  code_interpreter: 'Runs code on OpenAI\'s servers; the board has no matching sandbox for agents yet.',
  code_execution: 'Runs code on Google\'s servers; the board has no matching sandbox for agents yet.',
  built_in_code_execution: 'Runs code on Google\'s servers; the board has no matching sandbox for agents yet.',
  codeinterpretertool: 'Runs code on OpenAI\'s servers; the board has no matching sandbox for agents yet.',
  filesearchtool: 'Searches files uploaded to OpenAI; those files stay on OpenAI.',
  file_search: 'Searches files uploaded to OpenAI; those files stay on OpenAI.',
  bash: 'Runs shell commands; left off for safety. Give the agent the terminal tool yourself if you want it.',
  write: 'Writes files; left off so an imported agent starts read-only.',
  edit: 'Edits files; left off so an imported agent starts read-only.',
  multiedit: 'Edits files; left off so an imported agent starts read-only.',
  notebookedit: 'Edits notebooks; left off so an imported agent starts read-only.',
  computer_use_preview: 'Controls a computer; not available to board agents.',
  image_generation: 'Image tool from the original platform; use the board\'s image window instead.',
  end_call: 'Hangs up a phone call; only makes sense on ElevenLabs.',
  language_detection: 'Phone call language switching; only makes sense on ElevenLabs.',
  transfer_to_number: 'Phone call transfer; only makes sense on ElevenLabs.',
  skip_turn: 'Phone call turn-taking; only makes sense on ElevenLabs.',
});

/**
 * Map a list of foreign tool names to board tools.
 * @param {Array<string|{name:string, kind?:string}>} tools
 * @returns {{tools:string[], carried:string[], notCarried:Array<{name:string, why:string}>}}
 */
export function mapTools(tools) {
  const boardTools = new Set();
  const carried = [];
  const notCarried = [];
  for (const entry of Array.isArray(tools) ? tools : []) {
    const name = typeof entry === 'string' ? entry : entry?.name;
    if (!name) continue;
    const kind = typeof entry === 'object' ? entry.kind : null;
    const key = lower(name).replace(/\(.*\)$/, '').replace(/^mcp__.*/, 'mcp');
    const mapped = TOOL_MAP[key];
    if (mapped) {
      mapped.forEach(tool => boardTools.add(tool));
      carried.push(`${name} → ${mapped.join(', ')}`);
    } else if (key === 'mcp' || kind === 'mcp') {
      notCarried.push({ name, why: 'MCP server tool; connect that server on the board first, then add it.' });
    } else if (KNOWN_NOT_CARRIED[key]) {
      notCarried.push({ name, why: KNOWN_NOT_CARRIED[key] });
    } else if (kind === 'function' || kind === 'webhook' || kind === 'client') {
      notCarried.push({ name, why: 'Custom tool whose code lives on the original platform, so it cannot come along.' });
    } else {
      notCarried.push({ name, why: 'No matching board tool yet.' });
    }
  }
  return { tools: [...boardTools], carried, notCarried };
}

export function cleanText(value, max = 50000) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}
