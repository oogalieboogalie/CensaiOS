import {
  callModel,
  EMBEDDING_MODEL_KIND,
  resolveEmbeddingModelConfig,
} from './aiGateway/index.js';
import { createLogger } from './logger.js';

// Lines name the provider, the HTTP status and the model only; never the
// text being embedded or the provider's reply body.
const log = createLogger('embeddings');

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
    log.warn('cohere embeddings unavailable: no Cohere key is set');
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
    log.warn('cohere embeddings failed, will retry later', { status: err.status });
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
      log.warn('embeddings model not found, semantic search disabled', { status: 404, model: MODEL() });
      available = false;
    } else {
      log.warn('embeddings failed, will retry later', { status: err.status });
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
      log.warn('embeddings endpoint unreachable, semantic search disabled', { code: err?.code || 'unknown' });
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
