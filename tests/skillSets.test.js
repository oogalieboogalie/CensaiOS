// Exo-Skeleton skill sets: the built-ins (Alex's drawing and Idea Foundry
// research), the research step, the prompt section an equipped agent reads,
// the Idea Foundry's profession picking, and the equipped Browser lookup.
import { jest } from '@jest/globals';
import { BUILTIN_SKILL_SETS, BUILTIN_SKILL_SET_BY_ID } from '../server/skillSets/builtins.js';
import { buildSkillSetsPrompt, normalizeSkillSet } from '../server/skillSets/normalize.js';
import { researchSkillSet, skillSetFromReply } from '../server/skillSets/research.js';
import { normalizeFoundryInput, pickProfession, SURPRISE_PROFESSIONS } from '../server/skillSets/foundry.js';
import { equippedBrowserGo, equippedBrowserWindow } from '../server/skillSets/agentBrowser.js';
import { parseUrl } from '../src/lib/browserUrl.js';

describe('built-in skill sets', () => {
  test('Software Engineering is the ten skills and benchmark from the drawing', () => {
    const set = BUILTIN_SKILL_SET_BY_ID['software-engineering'];
    expect(set.skills).toHaveLength(10);
    expect(set.skills[0].title).toBe('First-Principles Thinking');
    expect(set.skills[9].title).toBe('Agnostic Continuous Adaptation');
    expect(set.benchmark).toMatch(/makes every engineer who touches it later smarter/);
  });

  test('every Idea Foundry profession becomes a valid set that keeps its mindsets', () => {
    const foundry = BUILTIN_SKILL_SETS.filter((set) => set.id.startsWith('foundry-'));
    expect(foundry.length).toBeGreaterThanOrEqual(29);
    // 243 research mindsets, with ones that say the same thing in other words merged.
    const mindsets = foundry.flatMap((set) => set.mindsets);
    expect(mindsets).toHaveLength(129);
    expect(mindsets.reduce((n, m) => n + 1 + (m.alsoFrom?.length || 0), 0)).toBe(243);
    for (const set of foundry) {
      expect(() => normalizeSkillSet(set)).not.toThrow();
      expect(set.mindsets.every((m) => m.name && Number.isInteger(m.issue))).toBe(true);
      expect(set.mindsets.flatMap((m) => m.alsoFrom || []).every((a) => a.name && Number.isInteger(a.issue))).toBe(true);
      expect(new Set(set.mindsets.map((m) => m.name.toLowerCase())).size).toBe(set.mindsets.length);
    }
    expect(new Set(BUILTIN_SKILL_SETS.map((set) => set.id)).size).toBe(BUILTIN_SKILL_SETS.length);
  });
});

describe('normalizeSkillSet', () => {
  test('cleans names, numbering and string skills', () => {
    const set = normalizeSkillSet({ name: '  Real   Estate ', skills: ['1. Listening: hears the real need', { title: '' }] });
    expect(set).toMatchObject({ id: 'real-estate', name: 'Real Estate', origin: 'manual' });
    expect(set.skills).toEqual([{ title: 'Listening', detail: 'hears the real need' }]);
  });

  test('refuses a set with no skills', () => {
    expect(() => normalizeSkillSet({ name: 'Empty', skills: [] })).toThrow(/at least one skill/);
  });
});

describe('the prompt an equipped agent reads', () => {
  test('lists skills, benchmark, the latest log lines and how to log', () => {
    const prompt = buildSkillSetsPrompt([{
      ...BUILTIN_SKILL_SET_BY_ID['software-engineering'],
      log: [{ outcome: 'worked', note: 'Cutting scope shipped the fix in a day.' }, { outcome: 'didnt', note: 'Over-designed the API.' }],
    }]);
    expect(prompt).toMatch(/## Skill sets/);
    expect(prompt).toMatch(/1\. First-Principles Thinking: Distinguished engineers/);
    expect(prompt).toMatch(/Worked before: Cutting scope/);
    expect(prompt).toMatch(/Did not work before: Over-designed/);
    expect(prompt).toMatch(/skill_set_log/);
    expect(buildSkillSetsPrompt([])).toBe('');
  });
});

describe('research step', () => {
  const reply = JSON.stringify({
    name: 'Real Estate', position: 'Real estate agent', summary: 'Great agents.',
    skills: Array.from({ length: 10 }, (_, i) => ({ title: `Skill ${i + 1}`, detail: 'Does it well.' })),
    benchmark: 'The Agent Benchmark: A good agent sells. A great agent is called back.',
  });

  test('searches, then asks the model for a ten-skill set', async () => {
    const search = jest.fn(async () => [{ title: 'Top agents', url: 'https://example.com/a', content: 'They listen.' }]);
    const complete = jest.fn(async () => `\`\`\`json\n${reply}\n\`\`\``);
    const set = await researchSkillSet('real estate agent', { search, complete });
    expect(search).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[0][0][0].content).toMatch(/GREAT instead of just good/);
    expect(complete.mock.calls[0][0][1].content).toMatch(/They listen\./);
    expect(set).toMatchObject({ name: 'Real Estate', origin: 'research', sources: ['https://example.com/a'] });
    expect(set.skills).toHaveLength(10);
  });

  test('works without web search and fails plainly on a bad reply', async () => {
    const set = await researchSkillSet('nurse', { complete: async () => reply });
    expect(set.skills).toHaveLength(10);
    expect(() => skillSetFromReply('no json here', 'nurse')).toThrow(/did not send back a skill set/);
    await expect(researchSkillSet('  ', { complete: async () => reply })).rejects.toThrow(/Name the position/);
  });
});

describe('Idea Foundry', () => {
  test('settings are bounded and accept a typed list', () => {
    expect(normalizeFoundryInput({ enabled: true, intervalHours: 24, professions: 'Pilot\n\nJudge, Nurse' }))
      .toMatchObject({ enabled: true, intervalHours: 24, professions: ['Pilot', 'Judge', 'Nurse'] });
    expect(() => normalizeFoundryInput({ intervalHours: 0 })).toThrow(/every 1 to 168 hours/);
  });

  test('surprise me skips professions the library already has; a typed list just cycles', () => {
    const library = [{ position: SURPRISE_PROFESSIONS[0] }];
    expect(pickProfession({ professions: [] }, 0, library)).toEqual({ profession: SURPRISE_PROFESSIONS[1], index: 1 });
    expect(pickProfession({ professions: ['Pilot', 'Judge'] }, 3, [{ position: 'Judge' }])).toEqual({ profession: 'Judge', index: 1 });
  });
});

describe('equipped Browser window', () => {
  const wins = [{ id: 'b1', kind: 'browser', equippedAgentId: 'atlas' }, { id: 'b2', kind: 'browser' }];

  test('finds only the browser equipped to that agent', () => {
    expect(equippedBrowserWindow(wins, 'atlas').id).toBe('b1');
    expect(equippedBrowserWindow(wins, 'genesis')).toBeNull();
  });

  const board = () => {
    const doc = { wins: structuredClone(wins) };
    return {
      doc,
      deps: {
        transact: async (_ws, mutate) => mutate(doc),
        readWindows: (d) => d.wins,
        writeWindow: (d, win) => { d.wins = d.wins.map((w) => (w.id === win.id ? win : w)); },
        resolveKey: async () => ({ apiKey: 'k' }),
        makeClient: () => ({ extract: async (url) => `text of ${url}` }),
      },
    };
  };

  test('browser_go opens the page in that window for everyone and reads it through Tavily', async () => {
    const { doc, deps } = board();
    const result = await equippedBrowserGo({ workspaceId: 'w', userId: 1, agentId: 'atlas', url: 'example.com' }, deps);
    expect(doc.wins[0].url).toBe('https://example.com');
    expect(doc.wins[1].url).toBeUndefined();
    expect(result).toMatch(/Opened https:\/\/example\.com in your Browser window\.\n\ntext of https:\/\/example\.com/);
  });

  test('browser_go says so when nothing is equipped, and opens without a Tavily key', async () => {
    const { deps } = board();
    expect(await equippedBrowserGo({ workspaceId: 'w', userId: 1, agentId: 'genesis', url: 'example.com' }, deps))
      .toMatch(/no Browser window is equipped to you/);
    const noKey = { ...deps, resolveKey: async () => ({ apiKey: '' }) };
    expect(await equippedBrowserGo({ workspaceId: 'w', userId: 1, agentId: 'atlas', url: 'example.com' }, noKey))
      .toMatch(/needs a Tavily key/);
  });

  test('the address bar rules are shared with the server', () => {
    expect(parseUrl('example.com')).toBe('https://example.com');
    expect(parseUrl('best pizza')).toMatch(/duckduckgo/);
    expect(parseUrl('https://youtu.be/abc', { embedYoutube: false })).toBe('https://youtu.be/abc');
  });
});
