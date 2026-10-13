import { jest } from '@jest/globals';
import { askResearch, fillCell, knowledgePrompt, queryKnowledge, runSearch, saveToKnowledge } from '../server/research/service.js';
import { LOCAL_EMBEDDER } from '../server/research/embedder.js';

function memoryStore() {
  const sources = [];
  const chunks = [];
  return {
    sources, chunks,
    saveSource: jest.fn(async (scope, src) => {
      const id = `s${sources.length + 1}`;
      const row = { id, url: src.url, title: src.title, query: src.query, embedModel: src.embedModel, chunkCount: src.chunks.length };
      sources.push(row);
      src.chunks.forEach((c, ord) => chunks.push({ id: `${id}-${ord}`, sourceId: id, ord, text: c.text, embedding: c.embedding, embedModel: c.embedding ? src.embedModel : null, url: src.url, title: src.title }));
      return row;
    }),
    loadChunks: jest.fn(async () => chunks),
    listSources: jest.fn(async () => sources),
  };
}

const fakeEmbedder = {
  id: 'fake:v1',
  label: 'fake',
  embed: jest.fn(async (texts) => texts.map((t) => [t.toLowerCase().includes('austin') ? 1 : 0, 1])),
};

const scope = { userId: 7, workspaceId: 'ws-1' };

describe('research service', () => {
  test('runSearch normalizes options and results', async () => {
    const tavily = { searchFull: jest.fn(async () => ({ answer: 'A short answer', results: [{ url: 'https://a.example', title: 'A', content: 'snip', published_date: '2026-10-01', score: 0.876 }, { title: 'no url' }] })) };
    const out = await runSearch(tavily, { query: ' acme hq ', depth: 'advanced', maxResults: 99 });
    expect(tavily.searchFull).toHaveBeenCalledWith('acme hq', expect.objectContaining({ depth: 'advanced', includeAnswer: true, maxResults: 20 }));
    expect(out.answer).toBe('A short answer');
    expect(out.results).toEqual([{ url: 'https://a.example', title: 'A', content: 'snip', publishedAt: '2026-10-01', score: 0.88 }]);
    await expect(runSearch(tavily, { query: '  ' })).rejects.toMatchObject({ statusCode: 400 });
  });

  test('saveToKnowledge extracts full pages, chunks, embeds and stores them', async () => {
    const store = memoryStore();
    const tavily = { extractMany: jest.fn(async () => new Map([['https://a.example', 'Acme is based in Austin, Texas. '.repeat(80)]])) };
    const out = await saveToKnowledge(scope, {
      query: 'acme',
      results: [{ url: 'https://a.example', title: 'Acme about' }, { url: 'https://b.example', title: 'Acme pricing', content: 'Plans from $49' }],
    }, { tavily, embedder: fakeEmbedder, store });
    expect(tavily.extractMany).toHaveBeenCalledWith(['https://a.example', 'https://b.example']);
    expect(out.saved).toHaveLength(2);
    expect(out.saved[0].fullText).toBe(true);
    expect(out.saved[1].fullText).toBe(false);
    expect(store.sources[0].chunkCount).toBeGreaterThan(1);
    expect(store.sources[0].embedModel).toBe('fake:v1');
    expect(store.chunks.find((c) => c.sourceId === 's2').text).toContain('Plans from $49');
  });

  test('saveToKnowledge still saves snippets when extract fails, keyword-only without a key', async () => {
    const store = memoryStore();
    const tavily = { extractMany: jest.fn(async () => { throw new Error('down'); }) };
    const out = await saveToKnowledge(scope, { results: [{ url: 'https://c.example', title: 'C', content: 'snippet' }] }, { tavily, embedder: LOCAL_EMBEDDER, store });
    expect(out.saved[0].embedModel).toBeNull();
    expect(store.chunks[0].embedding).toBeNull();
    await expect(saveToKnowledge(scope, { results: [] }, { tavily, embedder: LOCAL_EMBEDDER, store })).rejects.toMatchObject({ code: 'NOTHING_TO_SAVE' });
  });

  test('queryKnowledge and askResearch answer from saved chunks with citations', async () => {
    const store = memoryStore();
    await saveToKnowledge(scope, { results: [{ url: 'https://a.example', title: 'Acme about', content: 'Acme is headquartered in Austin, Texas.' }, { url: 'https://p.example', title: 'Pricing', content: 'Plans cost $49 per month.' }] },
      { tavily: { extractMany: async () => new Map() }, embedder: fakeEmbedder, store });
    const { hits } = await queryKnowledge(scope, 'Where is Acme headquartered?', { embedder: fakeEmbedder, store });
    expect(hits[0].url).toBe('https://a.example');
    expect(hits[0].embedding).toBeUndefined();
    expect(knowledgePrompt(hits).prompt).toContain('[1] Acme about');

    const complete = jest.fn(async () => 'Acme is in Austin [1].');
    const out = await askResearch(scope, 'Where is Acme headquartered?', { embedder: fakeEmbedder, store, complete, tavily: null });
    expect(out).toEqual({ answer: 'Acme is in Austin [1].', sources: expect.arrayContaining([{ n: 1, title: 'Acme about', url: 'https://a.example' }]), usedWeb: false });
    expect(complete.mock.calls[0][0][1].content).toContain('Acme is headquartered in Austin');
  });

  test('askResearch searches the web when nothing is saved and survives having no model', async () => {
    const store = memoryStore();
    const tavily = { searchFull: jest.fn(async () => ({ answer: 'Tavily says Austin.', results: [{ url: 'https://w.example', title: 'W', content: 'Austin HQ' }] })) };
    const complete = jest.fn(async () => { throw new Error('no model'); });
    const out = await askResearch(scope, 'acme hq?', { embedder: LOCAL_EMBEDDER, store, complete, tavily });
    expect(out.usedWeb).toBe(true);
    expect(out.answer).toBe('Tavily says Austin.');
    expect(out.sources[0].url).toBe('https://w.example');
  });

  test('fillCell boils a search down to a short value with its source', async () => {
    const tavily = { searchFull: jest.fn(async () => ({ answer: 'Acme Corp is at acme.example, based in Austin.', results: [{ url: 'https://acme.example', title: 'Acme', content: 'Austin' }, { url: 'https://crunch.example', title: 'Crunch', content: 'HQ Austin' }] })) };
    const complete = jest.fn(async () => '```json\n{"value": "acme.example · Austin", "source": 2}\n```');
    const cell = await fillCell({ tavily, complete }, { value: 'Acme Corp', prompt: 'website and HQ city', row: { Industry: 'Robots' } });
    expect(tavily.searchFull).toHaveBeenCalledWith('Acme Corp website and HQ city', expect.any(Object));
    expect(complete.mock.calls[0][0][1].content).toContain('Industry: Robots');
    expect(cell).toEqual({ value: 'acme.example · Austin', status: 'done', sourceUrl: 'https://crunch.example', sourceTitle: 'Crunch' });

    const fallback = await fillCell({ tavily, complete: async () => { throw new Error('x'); } }, { value: 'Acme Corp', prompt: 'hq' });
    expect(fallback.value).toContain('Austin');
    expect(fallback.sourceUrl).toBe('https://acme.example');
    await expect(fillCell({ tavily, complete }, { value: '', prompt: 'hq' })).rejects.toMatchObject({ statusCode: 400 });
  });
});
