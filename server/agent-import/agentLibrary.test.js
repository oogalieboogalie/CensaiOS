import { jest } from '@jest/globals';
import {
  avoidNameClashes, buildLibraryPlan, cleanName, cleanPrompt, isRealPrompt,
  readBlueprintSheet, readMainSheet, readPromptSheet,
} from './agentLibrary.js';
import { importLibraryPlan, undoLibraryImport } from './agentLibraryImport.js';

// The owner's old agent spreadsheets become helpers on the core agents'
// teams: real prompts only, kept as written, no duplicates on a second run.

const LONG = 'You are a careful helper. ' + 'Keep answers short and plain. '.repeat(10);
const csvCell = (s) => `"${String(s).replace(/"/g, '""')}"`;
const row = (...cells) => cells.map(csvCell).join(',');

const MAIN = [
  'Agent,Target Tool,Use Case,Technique,Prompt',
  row('\nHead Agent\u00a0', '', 'Route and delegate', '', `\n\n${LONG}\nLine two.\n`),
  row('Business Brain Agent', '', 'knowledge', '', 'None - Business Info Database'),
  row('Empty One', '', 'nothing yet', '', ''),
  row('Director', '', '', 'with anchor', `${LONG} Anchor A.`),
  row('Director', '', '', 'without anchor', `${LONG} Anchor B.`),
  row('Director', '', '', '', `${LONG} Anchor A.`),
  row('The ControllerThe Controller', 'TARGET TOOL:\u00a0Gemini', 'Budgets', 'TECHNIQUE: Plain', `# IDENTITY\n${LONG}`),
  row('Agent Manager (Callsign: SYNC', '', 'Agents', '', `# IDENTITY\n${LONG} Sync.`),
  row('', '', '', '', ''),
].join('\r\n');

const PROMPTS = ['Agent,Prompt', row('Head Agent', `${LONG}\nLine two.`), row('CATALYST', `# IDENTITY\n${LONG} Cortex.`)].join('\n');

const BLUEPRINTS = [
  'Agent,Purpose,prompt_points,Done?',
  row('Decision Agent', 'meetings', 'Intent → Metric → Constraint', ''),
  row('', '', 'Metric: the number that proves it', ''),
  row('Idea Agent', '', 'You are an Idea Enrichment Agent.', ''),
  row('', '', '', ''),
  row('', '', 'RULES:', ''),
  row('', '', 'Keep answers short and plain. '.repeat(8), ''),
].join('\n');

function plan(extra = {}) {
  return buildLibraryPlan({
    main: readMainSheet(MAIN, 'main.csv'),
    extras: [readPromptSheet(PROMPTS, 'prompts.csv'), readBlueprintSheet(BLUEPRINTS, 'bp.csv')],
    placement: { 'Head Agent': 'censai', 'The Controller': 'echo' },
    ...extra,
  });
}

describe('agent library plan', () => {
  test('cleans names without rewriting them', () => {
    expect(cleanName('\nHead Agent\u00a0')).toBe('Head Agent');
    expect(cleanName('The ControllerThe Controller')).toBe('The Controller');
    expect(cleanName('Agent Manager (Callsign: SYNC')).toBe('Agent Manager (Callsign: SYNC)');
  });

  test('keeps prompt text as written, only tidying the ends', () => {
    expect(cleanPrompt(`\n\n${LONG}\r\nLine two.\n`)).toBe(`${LONG}\nLine two.`);
    expect(isRealPrompt('None - Business Info Database')).toBe(false);
    expect(isRealPrompt('Intent → Metric → Constraint\n'.repeat(20))).toBe(false);
  });

  test('takes real prompts, skips notes, splits same-name variants', () => {
    const { agents, skipped } = plan();
    expect(agents.map(a => a.name)).toEqual([
      'Head Agent', 'Director', 'Director (v2)', 'The Controller', 'Agent Manager (Callsign: SYNC)', 'CATALYST', 'Idea Agent',
    ]);
    const head = agents[0];
    expect(head).toMatchObject({ parentId: 'censai', assigned: true, role: 'Route and delegate', source: { file: 'main.csv', row: 2 } });
    expect(head.systemPrompt).toBe(`${LONG}\nLine two.`);
    expect(agents.find(a => a.name === 'The Controller')).toMatchObject({ parentId: 'echo', specialty: 'Made for: Gemini · Technique: Plain' });
    expect(agents.find(a => a.name === 'Director (v2)')).toMatchObject({ parentId: 'censai', assigned: false });
    expect(agents.find(a => a.name === 'Idea Agent').systemPrompt).toMatch(/^You are an Idea Enrichment Agent\.\n\nRULES:\n/);
    const why = Object.fromEntries(skipped.map(s => [`${s.file}:${s.name}`, s.why]));
    expect(why['main.csv:Business Brain Agent']).toMatch(/only a note/);
    expect(why['main.csv:Empty One']).toBe('no prompt');
    expect(why['main.csv:Director']).toBe('same prompt as "Director"');
    expect(why['prompts.csv:Head Agent']).toBe('already in the main file as "Head Agent"');
    expect(why['bp.csv:Decision Agent']).toMatch(/only a note/);
  });

  test('a name already on the board gets " (imported)"', () => {
    const out = avoidNameClashes([{ name: 'Builder' }, { name: 'Scout' }], ['builder', 'Nexus']);
    expect(out[0]).toMatchObject({ name: 'Builder (imported)', renamedFrom: 'Builder' });
    expect(out[1]).toEqual({ name: 'Scout' });
  });
});

function fakeDb(state) {
  return {
    query: jest.fn(async (sql, params) => {
      if (sql.startsWith('SELECT id, name, hue FROM agents')) return { rows: state.agents };
      if (sql.includes('FROM sub_agents WHERE workspace_id')) {
        return {
          rows: state.subs.filter(s => s.workspace_id === params[0]).map(s => ({
            ...s, import_source: s.tool_scopes?.import?.source ?? null, import_key: s.tool_scopes?.import?.key ?? null,
          })),
        };
      }
      if (sql.includes('DELETE FROM sub_agents')) {
        const gone = state.subs.filter(s => s.workspace_id === params[0] && s.tool_scopes?.import?.source === params[1]);
        state.subs = state.subs.filter(s => !gone.includes(s));
        return { rows: gone };
      }
      throw new Error(`unexpected query ${sql}`);
    }),
  };
}

describe('agent library import', () => {
  const opts = { workspaceId: 'ws-1', userId: 2, source: 'test-library' };

  function setup() {
    const state = {
      agents: [{ id: 'censai', name: 'Censai', hue: 145 }, { id: 'echo', name: 'Echo', hue: 80 }],
      subs: [{ id: 'own', name: 'CATALYST', parent_id: 'censai', workspace_id: 'ws-1', active: true, tool_scopes: {} }],
    };
    const createSubAgent = jest.fn(async (parentId, input, scope) => {
      const made = { id: `${input.name}-${parentId}`, name: input.name, parent_id: parentId, workspace_id: scope.workspaceId, active: true, tool_scopes: input.toolScopes };
      state.subs.push(made);
      return made;
    });
    return { state, deps: { db: fakeDb(state), createSubAgent }, createSubAgent };
  }

  test('adds read-only helpers, tagged, and a second run adds nothing', async () => {
    const { state, deps, createSubAgent } = setup();
    const first = await importLibraryPlan(plan(), deps, opts);
    expect(first.created).toHaveLength(7);
    expect(first.created.find(a => a.renamedFrom === 'CATALYST').name).toBe('CATALYST (imported)');
    const [parentId, input, scope] = createSubAgent.mock.calls.find(([, i]) => i.name === 'The Controller');
    expect(parentId).toBe('echo');
    expect(input).toMatchObject({ permission: 'researcher', hue: 80, toolScopes: { import: { source: 'test-library', key: 'The Controller', file: 'main.csv' } } });
    expect(scope).toEqual({ workspaceId: 'ws-1', userId: 2 });

    const again = await importLibraryPlan(plan(), deps, opts);
    expect(again.created).toHaveLength(0);
    expect(again.alreadyThere).toHaveLength(7);
    expect(state.subs).toHaveLength(8);

    const removed = await undoLibraryImport(deps.db, opts);
    expect(removed).toHaveLength(7);
    expect(state.subs.map(s => s.id)).toEqual(['own']);
  });

  test('dry run writes nothing and an unknown team stops the run', async () => {
    const { deps, createSubAgent } = setup();
    const dry = await importLibraryPlan(plan(), deps, { ...opts, dryRun: true });
    expect(dry.created).toHaveLength(7);
    expect(createSubAgent).not.toHaveBeenCalled();
    await expect(importLibraryPlan(plan({ placement: { 'Head Agent': 'nobody' } }), deps, opts)).rejects.toThrow(/nobody/);
  });
});
