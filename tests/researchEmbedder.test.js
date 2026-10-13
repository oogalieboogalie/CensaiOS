import { jest } from '@jest/globals';
import { LOCAL_EMBEDDER, resolveEmbedder, safeEmbed } from '../server/research/embedder.js';

describe('research embedder', () => {
  afterEach(() => {
    delete process.env.EMBEDDING_PROVIDER;
    delete process.env.EMBEDDING_BASE_URL;
  });

  test('prefers the user OpenAI key, then Gemini, then Cohere', async () => {
    const keys = { google: 'g', cohere: 'c' };
    const loadUserKey = async (_id, provider) => (keys[provider] ? { apiKey: keys[provider] } : null);
    const call = jest.fn(async ({ config }) => ({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }], config }));
    const embedder = await resolveEmbedder(7, { loadUserKey, call });
    expect(embedder.id).toBe('google:text-embedding-004');
    expect(await embedder.embed(['a', 'b'])).toEqual([[1, 0], [0, 1]]);
    expect(call.mock.calls[0][0].config).toMatchObject({ baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKey: 'g' });
  });

  test('Cohere gets its own body shape and input type', async () => {
    const call = jest.fn(async () => ({ embeddings: { float: [[0.5, 0.5]] } }));
    const embedder = await resolveEmbedder(7, { loadUserKey: async (_id, p) => (p === 'cohere' ? { apiKey: 'c' } : null), call });
    expect(await embedder.embed(['q'], 'search_query')).toEqual([[0.5, 0.5]]);
    expect(call.mock.calls[0][0].body).toMatchObject({ texts: ['q'], input_type: 'search_query', model: 'embed-v4.0' });
  });

  test('falls back to keyword ranking with no key, and safeEmbed never throws', async () => {
    const embedder = await resolveEmbedder(7, { loadUserKey: async () => null });
    expect(embedder).toBe(LOCAL_EMBEDDER);
    const broken = { id: 'x', embed: async () => { throw new Error('401'); } };
    expect(await safeEmbed(broken, ['a', 'b'])).toEqual([null, null]);
  });

  test('uses the server embedding model only when the install configured one', async () => {
    process.env.EMBEDDING_BASE_URL = 'http://localhost:11434/v1';
    const embedder = await resolveEmbedder(null, { loadUserKey: async () => null });
    expect(embedder.id).toMatch(/^server:/);
  });
});
