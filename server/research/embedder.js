// RESEARCH KNOWLEDGE BASE — which embedding model a person's saves and
// questions use. BYOK first, in this order: the user's OpenAI key, their
// Google Gemini key, their Cohere key. Then the server's own embedding model
// when the install configured one (EMBEDDING_PROVIDER / EMBEDDING_BASE_URL,
// e.g. Ollama with nomic-embed-text). With none of those the knowledge base
// still works: retrieval falls back to local keyword ranking (BM25), which
// needs no key and no download.

import { callModel, EMBEDDING_MODEL_KIND, resolveEmbeddingModelConfig } from '../aiGateway/index.js';

const BATCH = 64;
const MAX_INPUT = 6000;

export const LOCAL_EMBEDDER = Object.freeze({
  id: null,
  label: 'Keyword ranking (BM25, no key needed)',
  embed: async (texts) => texts.map(() => null),
});

const BYOK = [
  {
    provider: 'openai',
    id: 'openai:text-embedding-3-small',
    label: 'OpenAI text-embedding-3-small (your key)',
    config: (apiKey) => ({ provider: 'openai', model: 'text-embedding-3-small', baseUrl: 'https://api.openai.com/v1', endpoint: '/embeddings', apiKey }),
  },
  {
    provider: 'google',
    id: 'google:text-embedding-004',
    label: 'Gemini text-embedding-004 (your key)',
    config: (apiKey) => ({ provider: 'google', model: 'text-embedding-004', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', endpoint: '/embeddings', apiKey }),
  },
  {
    provider: 'cohere',
    id: 'cohere:embed-v4.0',
    label: 'Cohere embed-v4.0 (your key)',
    config: (apiKey) => ({ provider: 'cohere', model: 'embed-v4.0', baseUrl: 'https://api.cohere.com', endpoint: '/v2/embed', apiKey, headers: { 'X-Client-Name': 'homebase' } }),
  },
];

function vectorsFrom(data, config) {
  if (config.provider === 'cohere') return data?.embeddings?.float || data?.embeddings || [];
  return (data?.data || []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((row) => row.embedding);
}

function makeEmbedder({ id, label, config }, call) {
  return {
    id,
    label,
    async embed(texts, inputType = 'search_document') {
      const out = [];
      for (let i = 0; i < texts.length; i += BATCH) {
        const input = texts.slice(i, i + BATCH).map((t) => String(t || ' ').slice(0, MAX_INPUT));
        const body = config.provider === 'cohere'
          ? { model: config.model, texts: input, input_type: inputType, embedding_types: ['float'], truncate: 'END' }
          : { model: config.model, input };
        const data = await call({ kind: EMBEDDING_MODEL_KIND, config, body, logContext: { source: 'research-knowledge' } });
        const vectors = vectorsFrom(data, config);
        input.forEach((_, j) => out.push(Array.isArray(vectors[j]) ? vectors[j] : null));
      }
      return out;
    },
  };
}

function serverEmbedderConfigured() {
  return Boolean(process.env.EMBEDDING_PROVIDER || process.env.EMBEDDING_BASE_URL);
}

/**
 * The embedder for this user. Never throws: a broken key falls back to the
 * keyword ranking instead of blocking a save.
 */
export async function resolveEmbedder(userId, { loadUserKey, call = callModel } = {}) {
  const load = loadUserKey || (async (id, provider) => {
    const { getUserApiKeyConfig } = await import('../security/userApiKeys.js');
    return getUserApiKeyConfig(id, provider);
  });
  for (const option of BYOK) {
    try {
      const key = userId ? await load(userId, option.provider) : null;
      if (key?.apiKey) return makeEmbedder({ id: option.id, label: option.label, config: option.config(key.apiKey) }, call);
    } catch {
      // Try the next provider.
    }
  }
  if (serverEmbedderConfigured()) {
    const config = resolveEmbeddingModelConfig();
    return makeEmbedder({ id: `server:${config.model}`, label: `${config.model} (this server)`, config }, call);
  }
  return LOCAL_EMBEDDER;
}

/** Embed, but never fail the caller: on error every vector is null. */
export async function safeEmbed(embedder, texts, inputType) {
  if (!embedder?.id) return texts.map(() => null);
  try {
    return await embedder.embed(texts, inputType);
  } catch {
    return texts.map(() => null);
  }
}
