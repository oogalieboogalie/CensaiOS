// RESEARCH RECIPES — one-line inputs that come back shaped for a job, on top
// of the same Tavily search, save and ask base:
//   references — a topic in, citable sources (author, year, title, link,
//                one-line summary) saved to the board's knowledge base
//   market     — a ticker or sector in, today's news as short summaries with
//                source and time, plus one "what to watch" line
// Compare-and-price runs in the browser on the spreadsheet's Research
// columns; sales leads stay in LeadHound.

import { saveToKnowledge } from './service.js';

const MAX_REFS = 10;
const MAX_NEWS = 8;

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function parseJson(raw, key) {
  const match = String(raw || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[0]);
    return Array.isArray(data?.[key]) ? data : null;
  } catch {
    return null;
  }
}

function requireInput(input, what) {
  const text = String(input || '').trim().slice(0, 200);
  if (!text) throw Object.assign(new Error(`Type ${what}.`), { statusCode: 400, code: 'RECIPE_INPUT_REQUIRED' });
  return text;
}

async function tryComplete(complete, messages, opts) {
  try {
    return await complete(messages, opts);
  } catch {
    return '';
  }
}

/** References for a paper. Sources are saved to the knowledge base too. */
export async function referencesRecipe(scope, input, deps) {
  const topic = requireInput(input, 'a topic');
  const web = await deps.tavily.searchFull(`${topic} research study paper`, { depth: 'advanced', includeAnswer: false, maxResults: MAX_REFS });
  const results = web.results.filter((r) => r?.url).slice(0, MAX_REFS);
  const listed = results.map((r, i) => `[${i + 1}] ${r.title} (${r.url}) ${r.published_date || ''}\n${String(r.content || '').slice(0, 600)}`).join('\n\n');
  const parsed = parseJson(await tryComplete(deps.complete, [
    { role: 'system', content: 'You turn web search results into references for a student paper. Reply with JSON only: {"refs":[{"n":<result number>,"author":"<person or organisation, or empty>","year":"<4-digit year or empty>","title":"<work title>","summary":"<one plain sentence on what it says about the topic>","citable":<true if it is a study, report, book, article or official page; false for forums, ads or listicles>}]}. Never invent authors or years: leave them empty when the result does not say.' },
    { role: 'user', content: `Topic: ${topic}\n\nResults:\n${listed}` },
  ], { maxTokens: 1400, temperature: 0 }), 'refs');
  const byN = new Map((parsed?.refs || []).map((ref) => [Number(ref.n), ref]));
  const refs = results.map((r, i) => {
    const ref = byN.get(i + 1) || {};
    return {
      url: r.url,
      title: String(ref.title || r.title || r.url).slice(0, 300),
      author: String(ref.author || '').slice(0, 120),
      year: String(ref.year || String(r.published_date || '').slice(0, 4) || '').slice(0, 4),
      site: hostOf(r.url),
      summary: String(ref.summary || r.content || '').slice(0, 300),
      citable: ref.citable !== false,
    };
  }).filter((ref) => ref.citable);
  let saved = 0;
  if (refs.length && deps.store) {
    const out = await saveToKnowledge(scope, {
      query: `References: ${topic}`,
      results: refs.map((ref) => ({ url: ref.url, title: ref.title, content: ref.summary, published_date: ref.year || null })),
    }, deps).catch(() => ({ saved: [] }));
    saved = out.saved.length;
  }
  return { recipe: 'references', input: topic, refs, saved, modelUsed: Boolean(parsed) };
}

/** A market brief: today's news on a ticker or sector. */
export async function marketRecipe(_scope, input, deps) {
  const subject = requireInput(input, 'a ticker or sector');
  const web = await deps.tavily.searchFull(`${subject} stock market news today`, { depth: 'basic', includeAnswer: true, maxResults: MAX_NEWS, topic: 'news' });
  const results = web.results.filter((r) => r?.url).slice(0, MAX_NEWS);
  const listed = results.map((r, i) => `[${i + 1}] ${r.title} (${hostOf(r.url)}, ${r.published_date || 'undated'})\n${String(r.content || '').slice(0, 500)}`).join('\n\n');
  const parsed = parseJson(await tryComplete(deps.complete, [
    { role: 'system', content: 'You write a market brief from news results. Reply with JSON only: {"items":[{"n":<result number>,"summary":"<one plain sentence, the fact that moves the market>"}],"watch":"<one line: what to watch next, e.g. an earnings date, a data release, a price level named in the news>"}. Only use what the results say. No advice to buy or sell.' },
    { role: 'user', content: `Ticker or sector: ${subject}\n\nNews:\n${listed}` },
  ], { maxTokens: 900, temperature: 0.1 }), 'items');
  const byN = new Map((parsed?.items || []).map((item) => [Number(item.n), item]));
  const items = results.map((r, i) => ({
    url: r.url,
    title: String(r.title || r.url).slice(0, 300),
    source: hostOf(r.url),
    publishedAt: r.published_date || null,
    summary: String(byN.get(i + 1)?.summary || r.content || '').slice(0, 300),
  })).filter((item, i) => !parsed || byN.has(i + 1));
  return {
    recipe: 'market',
    input: subject,
    items,
    watch: String(parsed?.watch || web.answer || '').slice(0, 300),
    refreshedAt: new Date().toISOString(),
  };
}

export const RECIPES = { references: referencesRecipe, market: marketRecipe };
