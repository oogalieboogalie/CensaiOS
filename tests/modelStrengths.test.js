// Diagram 14, "model strengths": the auto-pick reads a task, finds the
// strength it needs on the strengths list, and picks a model the person has a key
// for, with a plain "why". Benchmarks results can tip the pick.
import { makeRecord } from '../src/lib/modelArena/benchmarks.js';
import { autoPickModel } from '../src/lib/modelStrengths/autoPick.js';
import { classifyTask, familyOf } from '../src/lib/modelStrengths/strengths.js';

const ALL_KEYS = ['anthropic', 'openai', 'xai', 'google'];
const current = { provider: 'cohere', model: 'command-a-03-2025' };
const pick = (text, opts = {}) => autoPickModel({ text, keyProviders: ALL_KEYS, current, ...opts });

test('each task goes to the family Alma wrote it under', () => {
  expect(pick('Make the login screen layout look nicer, new colors').family).toBe('claude');
  expect(pick('Write unit tests and refactor this function for edge cases').family).toBe('chatgpt');
  expect(pick('What are people saying on twitter about this, trending tweets').family).toBe('grok');
  expect(pick('Make me a logo image and a short video clip').family).toBe('gemini');
  expect(pick('Give me a step-by-step plan and a roadmap with milestones').family).toBe('chatgpt');
});

test('the why names the strength and a pick is marked as a change', () => {
  const result = pick('Brainstorm philosophy ideas about the meaning of work');
  expect(result).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5-5', changed: true });
  expect(result.why).toMatch(/Claude is best at .*Philosophising/);
});

test('a speed task uses the fast model', () => {
  expect(pick('Quick, one line: what trending on x right now?')).toMatchObject({ provider: 'xai', model: 'grok-4-fast' });
});

test('only models with a key are picked, and the why says what was skipped', () => {
  const result = pick('Generate an image for my poster', { keyProviders: ['anthropic'] });
  expect(result.keep).toBe(true);
  expect(result.why).toMatch(/no Gemini key/);
  const viaRouter = pick('Generate an image for my poster', { keyProviders: ['openrouter'] });
  expect(viaRouter).toMatchObject({ provider: 'openrouter', model: 'google/gemini-2.5-pro' });
});

test('a plain message keeps the current model', () => {
  expect(pick('hello there').keep).toBe(true);
  expect(classifyTask('')).toEqual([]);
});

test('benchmark results tip a tie and name the measured model', () => {
  // A Code task where the Gemini lane was right and fastest.
  const lanes = [{ provider: 'google', model: 'gemini-2.5-flash' }, { provider: 'openai', model: 'gpt-4.1' }];
  const results = [
    { status: 'done', text: 'a', firstTokenMs: 200, totalMs: 900, usage: { input: 10, output: 10 } },
    { status: 'done', text: 'b', firstTokenMs: 400, totalMs: 3000, usage: { input: 10, output: 10 } },
  ];
  const runs = [makeRecord({ prompt: 'p', system: '', lanes, results, marks: { best: 0, lanes: { 0: 'right', 1: 'right' } }, task: 'fix' })];
  const result = pick('Set up an automation workflow that runs in the background', { runs });
  expect(result).toMatchObject({ family: 'gemini', provider: 'google', model: 'gemini-2.5-flash' });
  expect(result.why).toMatch(/Fastest right answer on your Code benchmarks/);
});

test('families are found from OpenRouter model names too', () => {
  expect(familyOf('openrouter', 'x-ai/grok-4')).toBe('grok');
  expect(familyOf('anthropic', 'claude-opus-5-5')).toBe('claude');
  expect(familyOf('cohere', 'command-a')).toBe(null);
});
