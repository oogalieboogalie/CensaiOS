// ═══════════════════════════════════════════════════════════════════
//  MODEL CAPABILITY MAP
//  One table, shared by the browser (which controls a chat window shows) and
//  the server (which attachments a request may carry). A model only gets a
//  control when its provider's API really accepts that input:
//
//    image      image parts (image_url / inlineData)
//    pdf        PDF documents (OpenAI `file` part, OpenRouter file parser,
//               Gemini inlineData)
//    audioInput raw audio the model listens to (input_audio / inlineData)
//    video      video clips (Gemini inlineData, OpenRouter video_url)
//    voiceInput 'native'     → the mic records a clip the model hears directly
//               'transcribe' → the provider's speech-to-text turns it into text
//               null         → no mic
//    voiceOutput the provider's text-to-speech can read replies aloud
//
//  Plain-text files (code, markdown, CSV, JSON…) are inlined as text, so every
//  model accepts them (`textFiles: true`).
//
//  Unknown providers/models default to text only: hiding a control we can't
//  back is better than a button that fails.
// ═══════════════════════════════════════════════════════════════════

const MB = 1024 * 1024;

export const ATTACHMENT_LIMITS = Object.freeze({
  image: 5 * MB,
  file: 8 * MB,
  audio: 8 * MB,
  video: 15 * MB,
  // Raw bytes of every attachment in one request (the base64 body is ~4/3 of
  // this; the chat route accepts 32mb bodies).
  requestTotal: 20 * MB,
});

export const ATTACHMENT_KINDS = Object.freeze(['image', 'file', 'audio', 'video']);

const TEXT_FILE_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'yaml', 'yml', 'xml', 'html', 'htm',
  'css', 'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'h',
  'cpp', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh', 'sql', 'toml', 'ini', 'env', 'log', 'swift',
  'vue', 'svelte', 'graphql', 'proto', 'r', 'lua', 'dart', 'scala',
]);

const VOICE_PROVIDERS = new Set(['openai', 'google', 'google-native']);

const TEXT_ONLY = Object.freeze({
  image: false,
  pdf: false,
  audioInput: false,
  video: false,
});

const GEMINI_FULL = Object.freeze({ image: true, pdf: true, audioInput: true, video: true });

function lower(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeCapabilityProvider(provider) {
  const p = lower(provider);
  if (p === 'kimi') return 'moonshot';
  return p || null;
}

function openAiModelCaps(model) {
  const m = lower(model);
  if (/audio/.test(m)) return { ...TEXT_ONLY, audioInput: true };
  if (/(transcribe|tts|whisper|embedding|dall-e|gpt-image)/.test(m)) return TEXT_ONLY;
  if (/^(chatgpt-4o|gpt-4o|gpt-4\.1|gpt-4\.5|gpt-5|gpt-4-turbo|o1(?!-mini)|o3|o4)/.test(m)) {
    return { ...TEXT_ONLY, image: true, pdf: true };
  }
  return TEXT_ONLY;
}

function geminiModelCaps(model) {
  const m = lower(model).replace(/^models\//, '');
  if (/(tts|embedding|imagen|veo)/.test(m)) return TEXT_ONLY;
  if (m.startsWith('gemini')) return GEMINI_FULL;
  if (m.startsWith('gemma-3') || m.startsWith('gemma3') || m.startsWith('gemma-4') || m.startsWith('gemma4')) {
    return { ...TEXT_ONLY, image: true };
  }
  // A Google key with an unrecognized model name is still almost always Gemini.
  return m ? TEXT_ONLY : GEMINI_FULL;
}

function openRouterModelCaps(model) {
  const m = lower(model);
  // OpenRouter parses PDFs server-side for every model, so pdf is always on.
  const base = { ...TEXT_ONLY, pdf: true };
  const [vendor = '', name = ''] = m.split('/');
  if (vendor === 'google' && name.startsWith('gemini')) return { ...GEMINI_FULL };
  if (vendor === 'anthropic' && name.startsWith('claude')) return { ...base, image: true };
  if (vendor === 'openai') {
    const caps = openAiModelCaps(name);
    return { ...caps, pdf: true };
  }
  if (vendor === 'x-ai' && /(grok-4|vision)/.test(name)) return { ...base, image: true };
  if (vendor === 'meta-llama' && /(vision|llama-4)/.test(name)) return { ...base, image: true };
  if (vendor === 'qwen' && /vl/.test(name)) return { ...base, image: true };
  if (vendor === 'mistralai' && /(pixtral|mistral-small-3\.[1-9]|mistral-medium-3)/.test(name)) return { ...base, image: true };
  if (vendor === 'moonshotai' && /(vision|kimi-k2\.[5-9]|kimi-vl)/.test(name)) return { ...base, image: true };
  return base;
}

function ollamaModelCaps(model) {
  const m = lower(model);
  if (/(llava|bakllava|vision|llama4|gemma3|gemma4|qwen2\.5vl|qwen2\.5-vl|qwen3-vl|minicpm-v|moondream|mistral-small3\.[1-9]|granite3\.2-vision)/.test(m)) {
    return { ...TEXT_ONLY, image: true };
  }
  return TEXT_ONLY;
}

function moonshotModelCaps(model) {
  const m = lower(model);
  if (/(vision|kimi-latest|kimi-k2\.[5-9]|kimi-vl)/.test(m)) return { ...TEXT_ONLY, image: true };
  return TEXT_ONLY;
}

function cohereModelCaps(model) {
  return /vision/.test(lower(model)) ? { ...TEXT_ONLY, image: true } : TEXT_ONLY;
}

const PROVIDER_RULES = {
  openai: openAiModelCaps,
  google: geminiModelCaps,
  'google-native': geminiModelCaps,
  openrouter: openRouterModelCaps,
  ollama: ollamaModelCaps,
  moonshot: moonshotModelCaps,
  cohere: cohereModelCaps,
};

/**
 * Agents with no explicit provider run on the server default (AI_BASE_URL).
 * Infer the provider family from that URL so the capability rules still apply.
 */
export function capabilityProviderFor(provider, baseUrl) {
  const normalized = normalizeCapabilityProvider(provider);
  if (normalized) return normalized;
  const url = lower(baseUrl);
  if (!url) return null;
  if (url.includes('openrouter.ai')) return 'openrouter';
  if (url.includes('api.openai.com')) return 'openai';
  if (url.includes('generativelanguage.googleapis.com')) return 'google';
  if (url.includes('cohere.ai')) return 'cohere';
  if (url.includes('moonshot.cn') || url.includes('moonshot.ai')) return 'moonshot';
  if (url.includes(':11434') || url.includes('ollama')) return 'ollama';
  return null;
}

/**
 * Resolve what one provider + model can take in and give back.
 * @returns {{provider:string|null, model:string, image:boolean, pdf:boolean,
 *   audioInput:boolean, video:boolean, textFiles:true,
 *   voiceInput:'native'|'transcribe'|null, voiceOutput:boolean}}
 */
export function getModelCapabilities(provider, model) {
  const normalized = normalizeCapabilityProvider(provider);
  const rule = PROVIDER_RULES[normalized];
  const media = rule ? rule(model) : TEXT_ONLY;
  const hasVoiceApi = VOICE_PROVIDERS.has(normalized);
  return {
    provider: normalized,
    model: String(model || ''),
    ...media,
    textFiles: true,
    voiceInput: media.audioInput ? 'native' : (hasVoiceApi ? 'transcribe' : null),
    voiceOutput: hasVoiceApi,
  };
}

/** Short human list of what a model accepts beyond text, e.g. ['images', 'PDFs']. */
export function describeCapabilities(caps) {
  if (!caps) return [];
  const out = [];
  if (caps.image) out.push('images');
  if (caps.pdf) out.push('PDFs');
  if (caps.audioInput) out.push('audio');
  if (caps.video) out.push('video');
  if (caps.voiceInput) out.push('voice in');
  if (caps.voiceOutput) out.push('voice out');
  return out;
}

export function fileExtension(name) {
  const match = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  return match ? match[1].toLowerCase() : '';
}

export function isTextFile(name, mime) {
  const m = lower(mime);
  if (m.startsWith('text/')) return true;
  if (/(json|xml|yaml|javascript|typescript|x-sh|sql|csv|toml)/.test(m)) return true;
  return TEXT_FILE_EXTENSIONS.has(fileExtension(name));
}

export function isPdf(name, mime) {
  return lower(mime) === 'application/pdf' || fileExtension(name) === 'pdf';
}

/**
 * Classify a picked/pasted file into an attachment kind, or explain why the
 * current model can't take it. Pure: callers pass name/mime/size.
 * @returns {{ok:true, kind:string} | {ok:false, reason:string}}
 */
export function classifyAttachment({ name, mime, size }, caps) {
  const type = lower(mime);
  let kind;
  if (type.startsWith('image/')) kind = 'image';
  else if (type.startsWith('audio/')) kind = 'audio';
  else if (type.startsWith('video/')) kind = 'video';
  else kind = 'file';

  const label = caps?.model || 'This model';
  if (kind === 'image' && !caps?.image) return { ok: false, reason: `${label} can't read images.` };
  if (kind === 'audio' && !caps?.audioInput) return { ok: false, reason: `${label} can't listen to audio files.` };
  if (kind === 'video' && !caps?.video) return { ok: false, reason: `${label} can't watch video.` };
  if (kind === 'file') {
    if (isPdf(name, type)) {
      if (!caps?.pdf) return { ok: false, reason: `${label} can't read PDFs.` };
    } else if (!isTextFile(name, type)) {
      return { ok: false, reason: `${name || 'That file'} isn't a text file or PDF.` };
    }
  }
  const limit = ATTACHMENT_LIMITS[kind];
  if (Number(size) > limit) {
    return { ok: false, reason: `${name || 'That file'} is over the ${Math.round(limit / MB)} MB limit for ${kind === 'file' ? 'files' : kind}.` };
  }
  return { ok: true, kind };
}

/** Which <input accept> string fits the file picker for this model. */
export function fileAcceptFor(caps) {
  const parts = ['.txt', '.md', '.csv', '.json', '.yaml', '.yml', '.xml', '.html', '.js', '.jsx', '.ts', '.tsx', '.py', '.sql', '.log', 'text/*'];
  if (caps?.pdf) parts.unshift('application/pdf', '.pdf');
  if (caps?.audioInput) parts.push('audio/*');
  return parts.join(',');
}
