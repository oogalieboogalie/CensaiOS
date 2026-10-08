import { cardTags, rankAgentCards, scoreCard, stem, tokenize } from '../server/agent-registry/discoveryRank.js';

const nexus = {
  id: 'agent:nexus', name: 'Nexus', description: 'Database custodian, migrations are forever',
  skills: [
    { id: 'schema-design', name: 'Design schema', description: 'Model tables for Postgres.', tags: ['database', 'postgres', 'sql'] },
    { id: 'write-migration', name: 'Write migration', description: 'Forward-only migrations.', tags: ['database', 'migrations'] },
  ],
};
const genesis = {
  id: 'agent:genesis', name: 'Genesis', description: 'UI/UX + psychology',
  skills: [{ id: 'ui-design', name: 'Design UI', tags: ['ui', 'ux', 'design'] }],
};
const echo = {
  id: 'agent:echo', name: 'Echo', description: 'Business brain', metadata: { tags: ['Sales'] },
  skills: [{ id: 'market-scan', name: 'Market scan', tags: ['market', 'leads'] }],
};
const bare = { id: 'ext:7:bare', name: 'Bare', description: 'No skills here', skills: 'nonsense' };

test('tokenize drops stopwords and stems plurals and gerunds', () => {
  expect(tokenize('Who can help me write some Postgres migrations?')).toEqual(['write', 'postgre', 'migration']);
  expect(stem('designing')).toBe('design');
  expect(stem('queries')).toBe('query');
  expect(stem('class')).toBe('class');
});

test('skills outrank descriptions and matched skills are reported', () => {
  const ranked = rankAgentCards([genesis, echo, nexus], { query: 'write a postgres migration' });
  expect(ranked.map((entry) => entry.card.id)).toEqual(['agent:nexus']);
  expect(ranked[0].matchedSkills.map((skill) => skill.id)).toEqual(['write-migration', 'schema-design']);
  expect(ranked[0].reasons[0]).toMatch(/^skills: Write migration/);
});

test('a skill-name hit beats a description-only hit', () => {
  const describedOnly = { id: 'ext:1:d', name: 'Helper', description: 'can design things', skills: [] };
  const ranked = rankAgentCards([describedOnly, genesis], { query: 'design' });
  expect(ranked.map((entry) => entry.card.id)).toEqual(['agent:genesis', 'ext:1:d']);
  expect(scoreCard(describedOnly, ['design']).reasons).toEqual(['description']);
});

test('tags filter is an AND over skill tags and metadata tags, case-insensitive', () => {
  expect(cardTags(echo)).toEqual(expect.arrayContaining(['sales', 'market', 'leads']));
  expect(rankAgentCards([nexus, echo], { tags: ['SALES', 'leads'] }).map((e) => e.card.id)).toEqual(['agent:echo']);
  expect(rankAgentCards([nexus, echo], { tags: ['database', 'leads'] })).toEqual([]);
});

test('no query lists everything, preferred first, then by name; malformed skills are tolerated', () => {
  const ranked = rankAgentCards([nexus, bare, genesis, echo], {
    isPreferred: (card) => card.id === 'agent:nexus',
  });
  expect(ranked.map((entry) => entry.card.id)).toEqual(['agent:nexus', 'ext:7:bare', 'agent:echo', 'agent:genesis']);
});

test('limit is clamped and unmatched cards are dropped for a real query', () => {
  const many = Array.from({ length: 80 }, (_, i) => ({ ...genesis, id: `ext:1:${i}`, name: `G${i}` }));
  expect(rankAgentCards(many, { query: 'ui', limit: 500 })).toHaveLength(50);
  expect(rankAgentCards(many, { query: 'ui', limit: 0 })).toHaveLength(10);
  expect(rankAgentCards([bare], { query: 'kubernetes' })).toEqual([]);
});
