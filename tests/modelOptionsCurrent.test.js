import { MODEL_OPTIONS } from '../src/lib/agentModelOptions.js';
import { getModelCapabilities } from '../src/lib/chat/modelCapabilities.js';

// Names the providers have retired or shut down (checked 2026-11-04). The menus
// must not offer them to new agents; saved agents keep theirs as "(saved)".
const RETIRED = [
  'gemini-1.5-flash', 'gemini-2.0-flash', 'google/gemini-2.0-flash-exp:free',
  'grok-3-mini', 'grok-code-fast-1', 'grok-4-fast',
  'gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini', 'openai/gpt-4.1',
  'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'kimi-k2-0711-preview',
  'meta-llama/llama-3-8b-instruct:free',
];

test('model menus offer no retired model names', () => {
  const offered = Object.values(MODEL_OPTIONS).flat().map(o => o.value);
  expect(offered.filter(v => RETIRED.includes(v))).toEqual([]);
});

test('GPT-6 models get image and PDF attachments', () => {
  for (const model of ['gpt-6.1-sol', 'gpt-6-luna']) {
    expect(getModelCapabilities('openai', model)).toMatchObject({ image: true, pdf: true, tools: true });
  }
  expect(getModelCapabilities('openrouter', 'openai/gpt-6.1-sol')).toMatchObject({ image: true, pdf: true });
});
