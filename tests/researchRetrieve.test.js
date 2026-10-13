import { bm25Scores, chunkText, citationContext, cosine, rankChunks, tokenize } from '../server/research/retrieve.js';

describe('research retrieval', () => {
  test('chunkText keeps short text whole and splits long text with overlap', () => {
    expect(chunkText('  short page  ')).toEqual(['short page']);
    expect(chunkText('')).toEqual([]);
    const para = (n) => `Paragraph ${n}. ${'Dental practices miss calls at lunch. '.repeat(12)}`;
    const text = Array.from({ length: 8 }, (_, i) => para(i)).join('\n\n');
    const chunks = chunkText(text, { size: 600, overlap: 80 });
    expect(chunks.length).toBeGreaterThan(4);
    expect(chunks.every((c) => c.length <= 700)).toBe(true);
    expect(chunks.join(' ')).toContain('Paragraph 7');
  });

  test('chunkText cuts a single giant run of text', () => {
    const chunks = chunkText('x'.repeat(5000), { size: 1000, overlap: 100 });
    expect(chunks.length).toBeGreaterThanOrEqual(5);
    expect(chunks.every((c) => c.length <= 1000)).toBe(true);
  });

  test('tokenize drops stop words and punctuation', () => {
    expect(tokenize('What is the HQ city of Acme, Inc.?')).toEqual(['hq', 'city', 'acme', 'inc']);
  });

  test('bm25 ranks the chunk that mentions the query terms', () => {
    const chunks = [{ text: 'Pricing starts at $49 a month' }, { text: 'Acme is headquartered in Austin, Texas' }, { text: 'Founded in 2019' }];
    const scores = bm25Scores('where is Acme headquartered', chunks);
    expect(scores[1]).toBeGreaterThan(scores[0]);
    expect(scores[1]).toBeGreaterThan(scores[2]);
  });

  test('rankChunks fuses vector and keyword ranks, only for the same embedding model', () => {
    const chunks = [
      { text: 'Acme HQ Austin', embedModel: 'm1', embedding: [1, 0] },
      { text: 'unrelated words entirely', embedModel: 'm1', embedding: [0.9, 0.1] },
      { text: 'other model text', embedModel: 'm2', embedding: [1, 0] },
    ];
    const hits = rankChunks('Acme HQ', chunks, { queryVector: [1, 0], model: 'm1', k: 5 });
    expect(hits[0].text).toBe('Acme HQ Austin');
    expect(hits[0].match).toBe('both');
    expect(hits.find((h) => h.text === 'other model text')).toBeUndefined();
    expect(hits.find((h) => h.text === 'unrelated words entirely').match).toBe('vector');
    expect(cosine([1, 0], [0, 1])).toBe(0);
  });

  test('citationContext numbers each source once', () => {
    const { text, sources } = citationContext([
      { url: 'https://a.example', title: 'A', text: 'one' },
      { url: 'https://b.example', title: 'B', text: 'two' },
      { url: 'https://a.example', title: 'A', text: 'three' },
    ]);
    expect(sources).toEqual([{ n: 1, title: 'A', url: 'https://a.example' }, { n: 2, title: 'B', url: 'https://b.example' }]);
    expect(text).toContain('[1] A\nthree');
  });
});
