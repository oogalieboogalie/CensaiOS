import {
  ATTACHMENT_LIMITS,
  capabilityProviderFor,
  classifyAttachment,
  describeCapabilities,
  fileAcceptFor,
  getModelCapabilities,
} from '../src/lib/chat/modelCapabilities.js';
import { MODEL_OPTIONS } from '../src/lib/agentModelOptions.js';

const pick = (caps) => ({
  image: caps.image, pdf: caps.pdf, audioInput: caps.audioInput, video: caps.video,
  voiceInput: caps.voiceInput, voiceOutput: caps.voiceOutput,
});

describe('model capability map', () => {
  test.each([
    ['openai', 'gpt-4.1', { image: true, pdf: true, audioInput: false, video: false, voiceInput: 'transcribe', voiceOutput: true }],
    ['openai', 'gpt-4o-audio-preview', { image: false, pdf: false, audioInput: true, video: false, voiceInput: 'native', voiceOutput: true }],
    ['openai', 'gpt-3.5-turbo', { image: false, pdf: false, audioInput: false, video: false, voiceInput: 'transcribe', voiceOutput: true }],
    ['google', 'gemini-2.5-flash', { image: true, pdf: true, audioInput: true, video: true, voiceInput: 'native', voiceOutput: true }],
    ['google-native', 'gemini-3.8-flash', { image: true, pdf: true, audioInput: true, video: true, voiceInput: 'native', voiceOutput: true }],
    ['openrouter', 'anthropic/claude-sonnet-4.5', { image: true, pdf: true, audioInput: false, video: false, voiceInput: null, voiceOutput: false }],
    ['openrouter', 'google/gemini-2.5-pro', { image: true, pdf: true, audioInput: true, video: true, voiceInput: 'native', voiceOutput: false }],
    ['openrouter', 'deepseek/deepseek-chat', { image: false, pdf: true, audioInput: false, video: false, voiceInput: null, voiceOutput: false }],
    ['ollama', 'llama3.1:8b', { image: false, pdf: false, audioInput: false, video: false, voiceInput: null, voiceOutput: false }],
    ['ollama', 'llava:13b', { image: true, pdf: false, audioInput: false, video: false, voiceInput: null, voiceOutput: false }],
    ['cohere', 'command-a-vision-07-2025', { image: true, pdf: false, audioInput: false, video: false, voiceInput: null, voiceOutput: false }],
    ['cohere', 'command-a-03-2025', { image: false, pdf: false, audioInput: false, video: false, voiceInput: null, voiceOutput: false }],
    ['kimi', 'moonshot-v1-8k-vision-preview', { image: true, pdf: false, audioInput: false, video: false, voiceInput: null, voiceOutput: false }],
    ['opencode', 'big-pickle', { image: false, pdf: false, audioInput: false, video: false, voiceInput: null, voiceOutput: false }],
    ['something-new', 'mystery', { image: false, pdf: false, audioInput: false, video: false, voiceInput: null, voiceOutput: false }],
  ])('%s / %s', (provider, model, expected) => {
    const caps = getModelCapabilities(provider, model);
    expect(pick(caps)).toEqual(expected);
    expect(caps.textFiles).toBe(true);
  });

  test('every provider offered in the agent editor resolves to a capability entry', () => {
    for (const [provider, options] of Object.entries(MODEL_OPTIONS)) {
      for (const option of options) {
        const caps = getModelCapabilities(provider, option.value);
        expect(caps.provider).toBe(provider);
        expect(typeof caps.image).toBe('boolean');
      }
    }
  });

  test('infers the provider family from the server default base URL', () => {
    expect(capabilityProviderFor(null, 'http://localhost:11434/v1')).toBe('ollama');
    expect(capabilityProviderFor('', 'https://openrouter.ai/api/v1')).toBe('openrouter');
    expect(capabilityProviderFor(null, 'https://api.openai.com/v1')).toBe('openai');
    expect(capabilityProviderFor('Google', 'anything')).toBe('google');
    expect(capabilityProviderFor(null, 'http://my-gateway.internal/v1')).toBeNull();
  });

  test('describes what a model takes beyond text', () => {
    expect(describeCapabilities(getModelCapabilities('google', 'gemini-2.5-pro')))
      .toEqual(['images', 'PDFs', 'audio', 'video', 'voice in', 'voice out']);
    expect(describeCapabilities(getModelCapabilities('ollama', 'llama3.1:8b'))).toEqual([]);
  });

  test('file picker only offers PDFs when the model reads them', () => {
    expect(fileAcceptFor(getModelCapabilities('openai', 'gpt-4o'))).toContain('application/pdf');
    expect(fileAcceptFor(getModelCapabilities('ollama', 'llava'))).not.toContain('application/pdf');
  });
});

describe('classifyAttachment', () => {
  const gpt = getModelCapabilities('openai', 'gpt-4o');
  const llama = getModelCapabilities('ollama', 'llama3.1:8b');

  test('accepts what the model supports', () => {
    expect(classifyAttachment({ name: 'a.png', mime: 'image/png', size: 10 }, gpt)).toEqual({ ok: true, kind: 'image' });
    expect(classifyAttachment({ name: 'a.pdf', mime: 'application/pdf', size: 10 }, gpt)).toEqual({ ok: true, kind: 'file' });
    expect(classifyAttachment({ name: 'notes.md', mime: '', size: 10 }, llama)).toEqual({ ok: true, kind: 'file' });
  });

  test('refuses what it does not, with a reason', () => {
    expect(classifyAttachment({ name: 'a.png', mime: 'image/png', size: 10 }, llama))
      .toEqual({ ok: false, reason: "llama3.1:8b can't read images." });
    expect(classifyAttachment({ name: 'a.pdf', mime: 'application/pdf', size: 10 }, llama).ok).toBe(false);
    expect(classifyAttachment({ name: 'clip.mp4', mime: 'video/mp4', size: 10 }, gpt).reason).toMatch(/can't watch video/);
    expect(classifyAttachment({ name: 'song.mp3', mime: 'audio/mpeg', size: 10 }, gpt).reason).toMatch(/can't listen/);
    expect(classifyAttachment({ name: 'app.exe', mime: 'application/octet-stream', size: 10 }, gpt).reason).toMatch(/isn't a text file or PDF/);
  });

  test('enforces per-kind size limits', () => {
    const result = classifyAttachment({ name: 'big.png', mime: 'image/png', size: ATTACHMENT_LIMITS.image + 1 }, gpt);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/over the 5 MB limit/);
  });
});
