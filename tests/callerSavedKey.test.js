import { jest } from '@jest/globals';
import { applyCallerSavedKey } from '../server/aiGateway/callerSavedKey.js';

const local = {
  provider: null,
  model: 'llama3',
  baseUrl: 'http://127.0.0.1:11434/v1',
  apiKey: 'ollama',
};

describe('applyCallerSavedKey', () => {
  test('a named provider uses that vault key and does not switch providers', async () => {
    const borrow = jest.fn();
    const config = await applyCallerSavedKey({
      provider: 'google',
      model: 'gemini-3.8-flash',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: '',
    }, {
      userId: 7,
      lookup: async () => ({ apiKey: 'vault-gemini', modelName: 'gemini-3.8-flash' }),
      borrow,
    });
    expect(config).toMatchObject({ provider: 'google', apiKey: 'vault-gemini', model: 'gemini-3.8-flash' });
    expect(borrow).not.toHaveBeenCalled();
  });

  test('the local default borrows the key chat already uses', async () => {
    const config = await applyCallerSavedKey(local, {
      userId: 7,
      lookup: async () => null,
      borrow: async () => ({
        provider: 'anthropic',
        model: 'claude-haiku-5-5',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: 'vault-claude',
      }),
    });
    expect(config).toMatchObject({ provider: 'anthropic', model: 'claude-haiku-5-5', apiKey: 'vault-claude' });
  });

  test('a chosen provider with no key stays put', async () => {
    const borrow = jest.fn(async () => ({ provider: 'anthropic', apiKey: 'other' }));
    const start = {
      provider: 'openai',
      model: 'gpt-4.1',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
    };
    const config = await applyCallerSavedKey(start, { userId: 7, lookup: async () => null, borrow });
    expect(config).toBe(start);
    expect(borrow).not.toHaveBeenCalled();
  });

  test('no signed-in person leaves the config alone', async () => {
    const borrow = jest.fn();
    expect(await applyCallerSavedKey(local, { userId: null, borrow })).toBe(local);
    expect(borrow).not.toHaveBeenCalled();
  });
});
