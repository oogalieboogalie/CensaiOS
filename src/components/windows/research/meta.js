// Tavily Research: search the web, save results to the board's knowledge
// base, and ask over it. Also a "web research" helper on the agent network.
export const windowMeta = {
  kind: 'research',
  label: 'Research',
  componentName: 'ResearchWindow',
  componentPath: 'src/components/windows/research/index.jsx',
  defaultSize: { w: 760, h: 620 },
  lab: {
    title: 'Research',
    props: {
      research: {
        search: {
          query: 'independent dental practices adopting AI phone answering',
          depth: 'basic', includeAnswer: true, searchedAt: '2026-10-08T12:00:00Z',
          answer: 'Small practices are adopting AI receptionists mainly to catch after-hours and lunch-hour calls.',
          results: [
            { url: 'https://example.com/ai-dental-phones', title: 'Why small dental offices are moving phones to AI', content: 'Practices with two to six chairs report most missed calls happen at lunch and after five.', publishedAt: '2026-09-30', score: 0.82 },
          ],
        },
        kb: [{ id: 'kb-1', url: 'https://example.com/ai-dental-phones', title: 'Why small dental offices are moving phones to AI', savedAt: '2026-10-08T12:01:00Z', chunkCount: 7 }],
      },
    },
  },
};
