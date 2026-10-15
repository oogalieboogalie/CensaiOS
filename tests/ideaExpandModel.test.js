import { chooseIdeaModel } from '../server/routes/chat/ideaExpandModel.js';

describe('Idea Pad expand picks a model the person has a key for', () => {
  test('a Google key, or no key at all, keeps Gemini Flash', () => {
    expect(chooseIdeaModel([], { override: '' })).toEqual({ provider: 'google', model: 'gemini-2.5-flash' });
    expect(chooseIdeaModel(['anthropic', 'google'], { override: '' })).toEqual({ provider: 'google', model: 'gemini-2.5-flash' });
  });

  test('only a Claude key uses Claude instead of failing on a missing Google key', () => {
    const pick = chooseIdeaModel(['anthropic'], { override: '' });
    expect(pick.provider).toBe('anthropic');
    expect(pick.model).toMatch(/^claude-/);
  });

  test('only an OpenAI key uses OpenAI', () => {
    expect(chooseIdeaModel(['openai'], { override: '' }).provider).toBe('openai');
  });

  test('IDEA_EXPAND_MODEL still pins a Gemini model', () => {
    expect(chooseIdeaModel(['anthropic'], { override: 'gemini-2.0-pro' })).toEqual({ provider: 'google', model: 'gemini-2.0-pro' });
  });
});
