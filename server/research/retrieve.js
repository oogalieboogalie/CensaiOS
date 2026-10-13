// RESEARCH KNOWLEDGE BASE — chunking and retrieval, pure functions.
// Saved pages are cut into overlapping chunks on paragraph and sentence
// boundaries. A question is matched two ways and the rankings are fused:
//   lexical — BM25 over the chunk words, always on, needs no key
//   vector  — cosine against chunk embeddings made with the same model,
//             when the asker has an embedding key (OpenAI, Gemini, Cohere)
// Reciprocal rank fusion keeps the two scales from fighting each other.

const CHUNK_CHARS = 1100;
const OVERLAP_CHARS = 180;
const STOP = new Set(('a an and are as at be but by for from has have how i if in into is it its of on or that the their '
  + 'there they this to was were what when where which who why will with you your').split(' '));

/** Split page text into chunks of about CHUNK_CHARS with a small overlap. */
export function chunkText(text, { size = CHUNK_CHARS, overlap = OVERLAP_CHARS } = {}) {
  const clean = String(text || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const pieces = clean.split(/\n\n+/).flatMap((para) => (para.length <= size ? [para]
    : para.match(/[^.!?]+(?:[.!?]+|$)\s*/g) || [para]));
  const chunks = [];
  let current = '';
  let fresh = false; // current holds text no chunk has yet
  const flush = () => {
    const out = current.trim();
    if (out) chunks.push(out);
    current = out.length > overlap ? out.slice(-overlap).replace(/^\S*\s/, '') : '';
    fresh = false;
  };
  for (const raw of pieces) {
    let piece = raw.trim();
    while (piece.length > size) {
      if (current) flush();
      chunks.push(piece.slice(0, size));
      piece = piece.slice(size - overlap);
    }
    if (current && current.length + piece.length + 1 > size) flush();
    current = current ? `${current}\n${piece}` : piece;
    fresh = true;
  }
  if (fresh && current.trim()) chunks.push(current.trim());
  return chunks;
}

export function tokenize(text) {
  return (String(text || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
    .filter((word) => word.length > 1 && !STOP.has(word));
}

/** BM25 score of every chunk for the query, in chunk order. */
export function bm25Scores(query, chunks, { k1 = 1.4, b = 0.75 } = {}) {
  const terms = [...new Set(tokenize(query))];
  if (!terms.length || !chunks.length) return chunks.map(() => 0);
  const docs = chunks.map((chunk) => tokenize(chunk.text));
  const avg = docs.reduce((sum, doc) => sum + doc.length, 0) / docs.length || 1;
  const df = new Map(terms.map((term) => [term, docs.filter((doc) => doc.includes(term)).length]));
  return docs.map((doc) => {
    const tf = new Map();
    for (const word of doc) if (df.has(word)) tf.set(word, (tf.get(word) || 0) + 1);
    let score = 0;
    for (const term of terms) {
      const f = tf.get(term) || 0;
      if (!f) continue;
      const idf = Math.log(1 + (docs.length - df.get(term) + 0.5) / (df.get(term) + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * doc.length) / avg)));
    }
    return score;
  });
}

export function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function ranks(scores) {
  const order = scores.map((score, index) => ({ score, index })).filter((e) => e.score > 0)
    .sort((x, y) => y.score - x.score);
  const out = new Map();
  order.forEach((entry, rank) => out.set(entry.index, rank + 1));
  return out;
}

/**
 * Top chunks for a question.
 * @param {string} query
 * @param {Array<{text, embedding?, embedModel?}>} chunks
 * @param {{ queryVector?: number[]|null, model?: string|null, k?: number }} opts
 * @returns {Array<chunk & {score, match}>}
 */
export function rankChunks(query, chunks, { queryVector = null, model = null, k = 6 } = {}) {
  const list = Array.isArray(chunks) ? chunks : [];
  const lexical = ranks(bm25Scores(query, list));
  const vector = queryVector && model
    ? ranks(list.map((chunk) => (chunk.embedModel === model ? Math.max(0, cosine(queryVector, chunk.embedding)) : 0)))
    : new Map();
  const RRF = 60;
  return list.map((chunk, index) => {
    const l = lexical.get(index);
    const v = vector.get(index);
    const score = (l ? 1 / (RRF + l) : 0) + (v ? 1 / (RRF + v) : 0);
    return { ...chunk, score, match: l && v ? 'both' : v ? 'vector' : 'lexical' };
  }).filter((chunk) => chunk.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}

/** Numbered context block for a model, and the matching source list. */
export function citationContext(hits) {
  const sources = [];
  const byUrl = new Map();
  const blocks = hits.map((hit) => {
    const key = hit.url || hit.title;
    if (!byUrl.has(key)) {
      byUrl.set(key, sources.length + 1);
      sources.push({ n: sources.length + 1, title: hit.title || hit.url, url: hit.url || null });
    }
    return `[${byUrl.get(key)}] ${hit.title || hit.url}\n${hit.text}`;
  });
  return { text: blocks.join('\n\n---\n\n'), sources };
}
