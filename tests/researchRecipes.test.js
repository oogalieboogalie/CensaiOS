import { jest } from '@jest/globals';
import { marketRecipe, referencesRecipe } from '../server/research/recipes.js';
import { apaCitation, mlaCitation } from '../src/lib/research/citations.js';
import { compareSheet, splitItems } from '../src/components/windows/research/compareSheet.js';
import { LOCAL_EMBEDDER } from '../server/research/embedder.js';

const scope = { userId: 7, workspaceId: 'ws-1' };

describe('research recipes', () => {
  test('references: model fills author and year, skips non-citable pages, saves the rest', async () => {
    const tavily = {
      searchFull: jest.fn(async () => ({ answer: '', results: [
        { url: 'https://journal.example/sleep', title: 'Sleep and memory', content: 'A study of 200 teens', published_date: '2024-03-01' },
        { url: 'https://forum.example/t/1', title: 'anyone sleep?', content: 'lol' },
      ] })),
      extractMany: async () => new Map(),
    };
    const complete = jest.fn(async () => JSON.stringify({ refs: [
      { n: 1, author: 'Maria Lopez', year: '2024', title: 'Sleep and memory consolidation in adolescents', summary: 'Teens who slept 8+ hours recalled more.', citable: true },
      { n: 2, citable: false },
    ] }));
    const store = { saveSource: jest.fn(async (_s, src) => ({ id: 's1', url: src.url })) };
    const out = await referencesRecipe(scope, 'sleep and memory', { tavily, complete, store, embedder: LOCAL_EMBEDDER });
    expect(tavily.searchFull).toHaveBeenCalledWith('sleep and memory research study paper', expect.objectContaining({ depth: 'advanced' }));
    expect(out.refs).toEqual([expect.objectContaining({ author: 'Maria Lopez', year: '2024', site: 'journal.example', title: 'Sleep and memory consolidation in adolescents' })]);
    expect(out.saved).toBe(1);
    expect(store.saveSource).toHaveBeenCalledTimes(1);
  });

  test('references without a model keep every result and the published year', async () => {
    const tavily = { searchFull: async () => ({ results: [{ url: 'https://a.example/x', title: 'X', content: 'c', published_date: '2023-01-01' }] }), extractMany: async () => new Map() };
    const out = await referencesRecipe(scope, 'x', { tavily, complete: async () => { throw new Error('no model'); }, store: null });
    expect(out.refs[0]).toMatchObject({ year: '2023', author: '', title: 'X' });
    expect(out.modelUsed).toBe(false);
    await expect(referencesRecipe(scope, ' ', { tavily })).rejects.toMatchObject({ statusCode: 400 });
  });

  test('market brief: news search, one-line summaries and a what-to-watch line', async () => {
    const tavily = { searchFull: jest.fn(async () => ({ answer: 'fallback', results: [
      { url: 'https://news.example/a', title: 'NVDA beats', content: 'Revenue up', published_date: '2026-10-08T14:00:00Z' },
      { url: 'https://news.example/b', title: 'Old story', content: 'meh' },
    ] })) };
    const complete = async () => '{"items":[{"n":1,"summary":"Nvidia beat revenue estimates on data center sales."}],"watch":"Guidance call on Oct 22."}';
    const out = await marketRecipe(scope, 'NVDA', { tavily, complete });
    expect(tavily.searchFull).toHaveBeenCalledWith('NVDA stock market news today', expect.objectContaining({ topic: 'news' }));
    expect(out.items).toEqual([expect.objectContaining({ source: 'news.example', summary: 'Nvidia beat revenue estimates on data center sales.' })]);
    expect(out.watch).toBe('Guidance call on Oct 22.');
    const plain = await marketRecipe(scope, 'NVDA', { tavily, complete: async () => '' });
    expect(plain.items).toHaveLength(2);
    expect(plain.watch).toBe('fallback');
  });

  test('citations in APA and MLA', () => {
    const ref = { author: 'Maria Lopez', year: '2024', title: 'Sleep and memory', url: 'https://journal.example/sleep', site: 'journal.example' };
    expect(apaCitation(ref)).toBe('Lopez, M. (2024). Sleep and memory. journal.example. https://journal.example/sleep');
    expect(mlaCitation(ref)).toBe('Lopez, Maria. “Sleep and memory.” journal.example, 2024, journal.example/sleep.');
    expect(apaCitation({ title: 'Guide', url: 'https://cdc.example/g' })).toBe('Guide. (n.d.). cdc.example. https://cdc.example/g');
  });

  test('compare: items become rows, criteria and best price become research columns set to run', () => {
    expect(splitItems('oat milk and almond milk vs soy milk')).toEqual(['oat milk', 'almond milk', 'soy milk']);
    const { sheet, title } = compareSheet({ items: 'oat milk, almond milk vs soy milk', criteria: 'protein, sugar', place: 'Austin', runBy: 'me' });
    expect(title).toBe('Compare: oat milk, almond milk, soy milk');
    expect(sheet.rows.map((r) => r.cells[sheet.columns[0].id]?.v)).toEqual(['oat milk', 'almond milk', 'soy milk']);
    expect(sheet.columns.map((c) => c.name)).toEqual(['Item', 'Best price · store', 'protein', 'sugar']);
    expect(sheet.columns[1].research.prompt).toContain('near Austin');
    expect(sheet.autoRun).toEqual(sheet.columns.slice(1).map((c) => c.id));
    expect(sheet.autoRunBy).toBe('me');
    expect(() => compareSheet({ items: 'just one' })).toThrow(/at least two/);
  });
});
