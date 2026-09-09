import {
  callModel,
  EMBEDDING_MODEL_KIND,
  resolveEmbeddingModelConfig,
} from './aiGateway/index.js';

const MODEL = () => embeddingConfig().model;

let available = null;

function usesCohere() {
  return embeddingConfig().provider === 'cohere';
}

function embeddingConfig() {
  return resolveEmbeddingModelConfig({
    modelProvider: process.env.EMBEDDING_PROVIDER || null,
    modelName: process.env.EMBEDDING_MODEL || null,
  });
}

async function embedWithCohere(text, inputType) {
  const config = embeddingConfig();
  if (!config.apiKey) {
    console.warn('Cohere embeddings unavailable: set COHERE_NON_COMMERCIAL_KEY or COHERE_PAID_API_KEY in .env.');
    available = false;
    return null;
  }

  const body = {
    model: config.model,
    texts: [text],
    input_type: inputType,
    embedding_types: ['float'],
    truncate: 'END',
  };

  const outputDimension = Number.parseInt(process.env.COHERE_EMBEDDING_DIMENSION || '', 10);
  if (Number.isFinite(outputDimension)) body.output_dimension = outputDimension;

  try {
    const data = await callModel({
      kind: EMBEDDING_MODEL_KIND,
      config,
      body,
      logContext: { source: 'semantic-embedding', inputType },
    });
    return data.embeddings?.float?.[0] || data.embeddings?.[0] || null;
  } catch (err) {
    if (!err.status) throw err;
    console.warn(`Cohere embeddings failed (${err.status}): ${err.body || err.message}. Will retry later.`);
    if ([401, 403, 498].includes(err.status)) available = false;
    return null;
  }
}

async function embedWithOpenAICompatible(text) {
  const config = embeddingConfig();
  try {
    const data = await callModel({
      kind: EMBEDDING_MODEL_KIND,
      config,
      body: { model: config.model, input: text },
      logContext: { source: 'semantic-embedding' },
    });
    return data.data?.[0]?.embedding || null;
  } catch (err) {
    if (!err.status) throw err;
    if (err.status === 404) {
      console.warn(`Embeddings unavailable (404). Semantic search disabled - run "ollama pull ${MODEL()}" to enable.`);
      available = false;
    } else {
      console.warn(`Embeddings failed (${err.status}): ${err.body || err.message}. Will retry later.`);
    }
    return null;
  }
}

export async function embed(text, opts = {}) {
  if (available === false) return null;

  try {
    const inputType = opts.inputType || 'search_document';
    const vector = usesCohere()
      ? await embedWithCohere(text, inputType)
      : await embedWithOpenAICompatible(text);
    if (!vector) return null;

    available = true;
    return vector;
  } catch (err) {
    if (available === null) {
      console.warn(`Embeddings endpoint unreachable: ${err.message}. Semantic search disabled.`);
      available = false;
    }
    return null;
  }
}

export function embeddingsAvailable() {
  return available !== false;
}

export function resetAvailability() {
  available = null;
}
