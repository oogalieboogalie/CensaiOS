import { jest } from '@jest/globals';
import { withBoardKnowledge } from '../src/lib/research/chatKnowledge.js';

const msgs = [{ from: 'me', text: 'hi' }, { from: 'agent', text: 'hello' }, { from: 'me', text: 'Where is Acme?' }];

describe('chat Knowledge toggle', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  test('off: nothing is fetched and the messages pass through', async () => {
    global.fetch = jest.fn();
    expect(await withBoardKnowledge(msgs, 'Where is Acme?', { enabled: false })).toEqual({ msgs, sources: [] });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('on: the board passages go in as a system note just before the question', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ prompt: '[BOARD KNOWLEDGE] [1] About Acme', sources: [{ n: 1, title: 'About Acme', url: 'https://a.example' }] }) }));
    const out = await withBoardKnowledge(msgs, 'Where is Acme?', { enabled: true, workspaceId: 'ws-1' });
    expect(global.fetch.mock.calls[0][0]).toBe('/api/research/kb/query?workspaceId=ws-1');
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ query: 'Where is Acme?', k: 6, asPrompt: true });
    expect(out.msgs.map((m) => m.from)).toEqual(['me', 'agent', 'system', 'me']);
    expect(out.sources).toHaveLength(1);
  });

  test('on, but nothing saved or the lookup fails: the chat still sends', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ hits: [], total: 0 }) }));
    expect((await withBoardKnowledge(msgs, 'x', { enabled: true, workspaceId: 'ws-1' })).msgs).toBe(msgs);
    global.fetch = jest.fn(async () => { throw new Error('offline'); });
    expect((await withBoardKnowledge(msgs, 'x', { enabled: true, workspaceId: 'ws-1' })).sources).toEqual([]);
  });
});
