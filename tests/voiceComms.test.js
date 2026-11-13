import {
  MAX_THREAD,
  appendExchange,
  pickInputMode,
  pickVoice,
  statusLabel,
  stripForSpeech,
} from '../src/components/windows/voiceComms/voiceLogic.js';

describe('Comms voice logic', () => {
  test('provider transcription wins, then the browser, then native audio', () => {
    expect(pickInputMode({ voiceInput: 'transcribe' }, true)).toBe('provider');
    expect(pickInputMode({ voiceInput: 'native' }, true)).toBe('browser');
    expect(pickInputMode({ voiceInput: null }, true)).toBe('browser');
    expect(pickInputMode(null, true)).toBe('browser');
    expect(pickInputMode({ voiceInput: 'native' }, false)).toBe('native');
    expect(pickInputMode({ voiceInput: null }, false)).toBeNull();
    expect(pickInputMode(null, false)).toBeNull();
  });

  test('markdown is stripped before a voice reads it', () => {
    const spoken = stripForSpeech('# Plan\n**Ship** the `fix` via [the PR](https://x.test).\n```js\nrun()\n```');
    expect(spoken).toBe('Plan Ship the fix via the PR. (code omitted)');
  });

  test('voices prefer natural ones in the user language and spread by seed', () => {
    const voices = [
      { name: 'Hans', lang: 'de-DE' },
      { name: 'David', lang: 'en-US' },
      { name: 'Aria Online (Natural)', lang: 'en-US' },
      { name: 'Guy Online (Natural)', lang: 'en-GB' },
    ];
    expect(pickVoice(voices, 0, 'en-US').name).toBe('Aria Online (Natural)');
    expect(pickVoice(voices, 1, 'en-US').name).toBe('Guy Online (Natural)');
    expect(pickVoice(voices, 2, 'en-US').name).toBe('Aria Online (Natural)');
    expect(pickVoice([{ name: 'Hans', lang: 'de-DE' }], 3, 'en').name).toBe('Hans');
    expect(pickVoice([], 0, 'en')).toBeNull();
  });

  test('a thread keeps only the latest messages and never stores an empty turn', () => {
    let thread = [];
    for (let i = 0; i < 10; i += 1) thread = appendExchange(thread, 'atlas', `q${i}`, `a${i}`);
    expect(thread).toHaveLength(MAX_THREAD);
    expect(thread[thread.length - 1]).toEqual({ from: 'atlas', text: 'a9' });
    expect(thread[thread.length - 2]).toEqual({ from: 'me', text: 'q9' });
    expect(appendExchange([], 'atlas', '', 'heard you')[0].text).toBe('(voice message)');
  });

  test('status names the agent while it works', () => {
    expect(statusLabel('thinking', 'Atlas')).toBe('Atlas is thinking…');
    expect(statusLabel('speaking', 'Atlas')).toBe('Atlas is speaking');
    expect(statusLabel('idle', 'Atlas')).toMatch(/Hold Space/);
  });
});
