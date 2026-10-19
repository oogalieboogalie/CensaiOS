// RESEARCH — the work behind the Research window, the chat Knowledge toggle,
// spreadsheet Research columns and the "web research" helper on the agent
// network. Every dependency is passed in (Tavily client, embedder, model
// completer, store), so tests run it against stand-ins.

import { chunkText, citationContext, rankChunks } from './retrieve.js';
import { safeEmbed } from './embedder.js';
import { chunkAndTag, fileText, tagText } from './ingest.js';

const MAX_CHUNKS_PER_PAGE = 40;
const MAX_SAVE = 20;
const HIT_CHARS = 1400;

function cleanResult(r = {}) {
  return {
    url: String(r.url || ''),
    title: String(r.title || r.url || 'Untitled').slice(0, 300),
    content: String(r.content || '').slice(0, 1200),
    publishedAt: r.published_date || r.publishedAt || null,
    score: Number.isFinite(r.score) ? Math.round(r.score * 100) / 100 : null,
  };
}

export function normalizeSearch(input = {}) {
  const query = String(input.query || '').trim().slice(0, 400);
  if (!query) throw Object.assign(new Error('Type what you want to research.'), { statusCode: 400, code: 'QUERY_REQUIRED' });
  return {
    query,
    depth: input.depth === 'advanced' ? 'advanced' : 'basic',
    includeAnswer: input.includeAnswer !== false,
    maxResults: Math.min(20, Math.max(1, Number(input.maxResults) || 8)),
    topic: input.topic === 'news' ? 'news' : 'general',
  };
}

export async function runSearch(tavily, input) {
  const search = normalizeSearch(input);
  const { answer, results } = await tavily.searchFull(search.query, search);
  return { ...search, answer, results: results.map(cleanResult).filter((r) => r.url), searchedAt: new Date().toISOString() };
}

/**
 * Fetch each result in full (Tavily extract), chunk it, embed it and store
 * it in the board's knowledge base. A page Tavily cannot extract keeps the
 * search snippet, so nothing the person chose to save is dropped.
 */
export async function saveToKnowledge(scope, { query = '', results = [] }, { tavily, embedder, store, onPage }) {
  const picked = (Array.isArray(results) ? results : []).map(cleanResult).filter((r) => r.url).slice(0, MAX_SAVE);
  if (!picked.length) throw Object.assign(new Error('Pick at least one result to save.'), { statusCode: 400, code: 'NOTHING_TO_SAVE' });
  let full = new Map();
  try {
    full = await tavily.extractMany(picked.map((r) => r.url));
  } catch {
    // Snippets only; still worth saving.
  }
  const saved = [];
  for (const result of picked) {
    const body = full.get(result.url) || '';
    const text = body.trim().length > result.content.length ? body : `${result.title}\n\n${result.content}`;
    const pieces = chunkText(text).slice(0, MAX_CHUNKS_PER_PAGE);
    const vectors = await safeEmbed(embedder, pieces, 'search_document');
    const tags = tagText(text, { title: result.title });
    const embedded = vectors.some(Boolean);
    const source = await store.saveSource(scope, {
      url: result.url,
      title: result.title,
      query,
      publishedAt: result.publishedAt,
      embedModel: embedded ? embedder.id : null,
      chunks: pieces.map((piece, i) => ({ text: piece, embedding: vectors[i] || null, tags: tagText(piece, { extra: tags.slice(0, 3) }) })),
      tags,
      kind: 'web',
    });
    saved.push({ ...source, fullText: Boolean(body.trim()) });
    onPage?.(source);
  }
  return { saved, embedder: embedder?.label || null };
}

const MAX_FILE_CHARS = 400000;

/**
 * Feed a file into the knowledge base (diagram 13): cut it into pieces
 * (one per step when it has numbered steps), tag every piece, embed when the
 * person has an embedding key, and store it. The same file name replaces.
 */
export async function saveFile(scope, { name = '', text = '' }, { embedder, store }) {
  const title = String(name || '').trim().slice(0, 200) || 'Untitled file';
  const body = fileText(title, text).slice(0, MAX_FILE_CHARS);
  if (!body.trim()) throw Object.assign(new Error('That file has no text to read.'), { statusCode: 400, code: 'EMPTY_FILE' });
  const { kind, tags, chunks } = chunkAndTag(body, { title: title.replace(/\.[a-z0-9]+$/i, '') });
  const kept = chunks.slice(0, MAX_CHUNKS_PER_PAGE * 2);
  const vectors = await safeEmbed(embedder, kept.map((c) => c.text), 'search_document');
  const embedded = vectors.some(Boolean);
  return store.saveSource(scope, {
    url: `file:${title}`,
    title,
    embedModel: embedded ? embedder.id : null,
    chunks: kept.map((c, i) => ({ ...c, embedding: vectors[i] || null })),
    tags,
    kind,
  });
}

export async function queryKnowledge(scope, query, { embedder, store }, { k = 6 } = {}) {
  const chunks = await store.loadChunks(scope.workspaceId);
  if (!chunks.length || !String(query || '').trim()) return { hits: [], total: chunks.length };
  const [queryVector] = embedder?.id && chunks.some((c) => c.embedModel === embedder.id)
    ? await safeEmbed(embedder, [query], 'search_query') : [null];
  const hits = rankChunks(query, chunks, { queryVector, model: embedder?.id || null, k })
    .map(({ embedding, ...hit }) => ({ ...hit, text: hit.text.slice(0, HIT_CHARS) }));
  return { hits, total: chunks.length };
}

/** The system message a chat gets when its Knowledge toggle is on. */
export function knowledgePrompt(hits) {
  const { text, sources } = citationContext(hits);
  return {
    sources,
    prompt: `[BOARD KNOWLEDGE] Passages from this board's knowledge base (saved web research). Use them when they help, `
      + `cite them inline as [1], [2] matching the numbers below, and say so when they do not cover the question.\n\n${text}`,
  };
}

function extractive(hits) {
  return hits.slice(0, 3).map((hit, i) => `[${i + 1}] ${hit.text.slice(0, 400).trim()}…`).join('\n\n');
}

/**
 * Answer a question from the board's knowledge base. With nothing saved
 * that matches, it searches the web with Tavily instead (and says so).
 */
export async function askResearch(scope, question, deps) {
  const q = String(question || '').trim().slice(0, 1000);
  if (!q) throw Object.assign(new Error('Ask a question.'), { statusCode: 400, code: 'QUESTION_REQUIRED' });
  let { hits } = await queryKnowledge(scope, q, deps, { k: 6 });
  let usedWeb = false;
  let webAnswer = '';
  if (!hits.length && deps.tavily) {
    const web = await deps.tavily.searchFull(q, { depth: 'basic', includeAnswer: true, maxResults: 5 });
    hits = web.results.map((r) => ({ url: r.url, title: r.title, text: String(r.content || '') })).filter((h) => h.text);
    webAnswer = web.answer || '';
    usedWeb = true;
  }
  if (!hits.length) return { answer: 'Nothing saved on this board covers that yet. Search for it and save the results first.', sources: [], usedWeb };
  const { text, sources } = citationContext(hits);
  try {
    const answer = await deps.complete([
      { role: 'system', content: 'You answer questions using only the numbered sources given. Cite inline as [1], [2]. Be concise and plain. If the sources do not answer it, say what is missing.' },
      { role: 'user', content: `Sources:\n\n${text}\n\nQuestion: ${q}` },
    ], { maxTokens: 700, temperature: 0.2 });
    if (answer.trim()) return { answer: answer.trim(), sources, usedWeb };
  } catch {
    // No model available: fall through to what Tavily and the passages say.
  }
  return { answer: webAnswer || extractive(hits), sources, usedWeb, extractive: !webAnswer };
}

function parseCell(raw) {
  const match = String(raw || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[0]);
    return { value: String(data.value ?? '').trim(), source: Number(data.source) || 1 };
  } catch {
    return null;
  }
}

/**
 * One spreadsheet cell: search the web for this row and boil the answer down
 * to a short cell value with the page it came from.
 */
export async function fillCell({ tavily, complete }, { value, prompt, row = {} }) {
  const subject = String(value || '').trim().slice(0, 200);
  const ask = String(prompt || '').trim().slice(0, 300);
  if (!subject || !ask) throw Object.assign(new Error('The row needs a value and the column needs a prompt.'), { statusCode: 400, code: 'CELL_INPUT_REQUIRED' });
  const context = Object.entries(row).filter(([, v]) => v).slice(0, 6).map(([k, v]) => `${k}: ${String(v).slice(0, 120)}`).join('; ');
  const web = await tavily.searchFull(`${subject} ${ask}`, { depth: 'basic', includeAnswer: true, maxResults: 5 });
  const results = web.results.map(cleanResult).filter((r) => r.url);
  if (!results.length && !web.answer) return { value: '', status: 'not found', sourceUrl: null, sourceTitle: null };
  const listed = results.map((r, i) => `[${i + 1}] ${r.title} (${r.url})\n${r.content}`).join('\n\n');
  let cell = null;
  try {
    cell = parseCell(await complete([
      { role: 'system', content: 'You fill one spreadsheet cell from web search results. Reply with JSON only: {"value": "<short cell value, under 12 words, no full sentence unless asked>", "source": <number of the result it came from>}. Use "" for value when the results do not say.' },
      { role: 'user', content: `Row: ${subject}${context ? ` (${context})` : ''}\nColumn asks: ${ask}\nSearch summary: ${web.answer || 'none'}\n\nResults:\n${listed}` },
    ], { maxTokens: 200, temperature: 0 }));
  } catch {
    cell = null;
  }
  if (!cell) cell = { value: String(web.answer || '').slice(0, 240), source: 1 };
  const source = results[cell.source - 1] || results[0] || null;
  return {
    value: cell.value,
    status: cell.value ? 'done' : 'not found',
    sourceUrl: source?.url || null,
    sourceTitle: source?.title || null,
  };
}
