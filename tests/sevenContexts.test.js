// Drawing 07, "seven contexts before answering": the keywords of the ask are
// looked up in seven places; only matches reach the agent's instructions, a
// line it already has is not added twice, and outside callers get nothing.
import { gatherSevenContexts } from '../server/sevenContexts/index.js';
import { matchCount, parseKeywords, stem, wordPatterns } from '../server/sevenContexts/keywords.js';

function fakeDb(tables = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      const hit = Object.entries(tables).find(([needle]) => sql.includes(needle));
      if (!hit) return { rows: [] };
      if (hit[1] instanceof Error) throw hit[1];
      return { rows: typeof hit[1] === 'function' ? hit[1](sql, params) : hit[1] };
    },
  };
}

const ask = (text) => [{ from: 'me', text }];
const tools = [
  { type: 'function', function: { name: 'create_website', description: 'Scaffold a site' } },
  { type: 'function', function: { name: 'create_sub_agent', description: 'Make a helper' } },
  { type: 'function', function: { name: 'send_email', description: 'Email someone' } },
];

describe('parseKeywords', () => {
  test('pulls the meaning words out of the drawing example', () => {
    expect(parseKeywords('Can we create a website to sell flowers?')).toEqual(['create', 'website', 'sell', 'flowers']);
  });
  test('stems so "flowers" finds "flower", and matches only at word starts', () => {
    expect(stem('flowers')).toBe('flower');
    expect(stem('selling')).toBe('sell');
    expect(wordPatterns(['flowers', 'c++'])).toEqual(['\\mflower', '\\mc\\+\\+']);
    expect(matchCount('Send multiple files', ['tips'])).toBe(0);
    expect(matchCount('create_website: sells flowers', ['create', 'website', 'flowers'])).toBe(3);
  });
});

describe('gatherSevenContexts', () => {
  test('names all seven contexts and adds only what matched', async () => {
    const db = fakeDb({
      knowledge_nuggets: [{ nugget_title: 'Flower shops', nugget_content: 'Same-day delivery sells' }],
      'FROM memories': [{ content: 'Stripe test keys broke the last website checkout' }],
      "outcome = $2": (_sql, params) => (params[1] === 'worked'
        ? [{ skill_set_id: 'web-dev', note: 'Shopify starter got a website live in a day' }]
        : []),
      'FROM workspace_agent_projects': [],
      'FROM agents': [],
      'FROM sub_agents': [],
    });
    const { block, report } = await gatherSevenContexts({
      db, agentId: 'atlas', workspaceId: 'ws-1', messages: ask('Can we create a website to sell flowers?'), tools,
      memory: { episodes: [{ summary: 'Asked about a florist logo' }], facts: [] },
    });
    expect(report.contexts.map((c) => c.name)).toEqual([
      'Researches Topics & Logs Nuggets', 'Stores Conversation Context', 'Logs Lessons Learned',
      'Knows Tools', 'Knows Project Directory', 'Knows Agents', 'Logs Things That Worked',
    ]);
    expect(report.contexts.map((c) => c.status)).toEqual(['found', 'found', 'found', 'found', 'none', 'none', 'found']);
    expect(block).toContain('- Nugget: Flower shops: Same-day delivery sells');
    expect(block).toContain('- Lesson: Stripe test keys broke the last website checkout');
    expect(block).toContain('- Worked before: Worked (web-dev): Shopify starter got a website live in a day');
    expect(block).toContain('- Tools that fit: create_website');
    expect(block).not.toContain('send_email');
    expect(block).not.toContain('create_sub_agent');
    // Earlier chats are already in the memory block: reported, not added again.
    expect(report.contexts[1].found).toEqual(['Asked about a florist logo']);
    expect(report.contexts[1].addedChars).toBe(0);
    expect(block).not.toContain('florist logo');
    expect(report.addedChars).toBe(block.length);
    expect(block.length).toBeLessThan(600);
  });

  test('adds nothing at all when nothing matches', async () => {
    const { block, report } = await gatherSevenContexts({
      db: fakeDb(), agentId: 'atlas', workspaceId: 'ws-1', messages: ask('quantum gardening tips'), tools,
    });
    expect(block).toBe('');
    expect(report.addedChars).toBe(0);
    expect(report.contexts.every((c) => c.status === 'none')).toBe(true);
  });

  test('a line the instructions already carry is not added twice', async () => {
    const db = fakeDb({ knowledge_nuggets: [{ nugget_title: 'Flower shops', nugget_content: 'deliver fast' }] });
    const { block, report } = await gatherSevenContexts({
      db, agentId: 'atlas', workspaceId: 'ws-1', messages: ask('flowers'),
      systemPrompt: '## Knowledge nuggets\n- Flower shops: deliver fast',
    });
    expect(report.contexts[0].status).toBe('found');
    expect(block).toBe('');
  });

  test('a broken place is marked, the others still run', async () => {
    const db = fakeDb({ knowledge_nuggets: new Error('relation does not exist'), 'FROM memories': [{ content: 'flowers wilt by noon' }] });
    const { report } = await gatherSevenContexts({ db, agentId: 'atlas', workspaceId: 'ws-1', messages: ask('flowers') });
    expect(report.contexts[0].status).toBe('unavailable');
    expect(report.contexts[2].status).toBe('found');
  });

  test('outside callers and empty asks get no lookup', async () => {
    const db = fakeDb();
    expect((await gatherSevenContexts({ db, agentId: 'a', origin: 'endpoint', messages: ask('flowers') })).report).toBeNull();
    expect((await gatherSevenContexts({ db, agentId: 'a', messages: ask('ok thanks') })).report).toBeNull();
    expect(db.calls).toHaveLength(0);
  });

  test('every query is scoped to the board', async () => {
    const db = fakeDb();
    await gatherSevenContexts({ db, agentId: 'atlas', workspaceId: 'ws-9', messages: ask('website flowers') });
    for (const call of db.calls.filter((c) => !c.sql.includes('FROM agents'))) {
      expect(call.params).toContain('ws-9');
    }
  });
});

test('a project or agent the instructions already name is not added again', async () => {
  const db = fakeDb({
    'FROM workspace_agent_projects': [{ project_id: 'p1', project_name: 'Bloom website', project_summary: 'flower store' }],
    'FROM sub_agents': [{ name: 'Webby', role: 'Website builder' }],
  });
  const { block, report } = await gatherSevenContexts({
    db, agentId: 'atlas', workspaceId: 'ws-1', messages: ask('website for flowers'),
    systemPrompt: '### Bloom website\n- Webby [helper]: builds sites',
  });
  expect(report.contexts[4].found).toEqual(['Bloom website: flower store']);
  expect(report.contexts[5].found).toEqual(['Webby (Website builder)']);
  expect(block).toBe('');
});
