// Scout agents: the repo map (what each file defines, who imports whom),
// kept fresh by reading only changed files, and "where do I change X?"
// answered from the map and then pinned by the scout's small model.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseFile, wordsOf } from '../server/repoScout/parse.js';
import { forgetRepoMaps, getRepoMap, mapStats } from '../server/repoScout/map.js';
import { describeFile, normalizeRelPath, overview, requestWords } from '../server/repoScout/query.js';
import { findWhereToChange } from '../server/repoScout/find.js';
import { buildScoutMessages, parseScoutAnswer } from '../server/repoScout/scoutModel.js';
import { formatFileLinks, formatFind, formatMapOverview } from '../server/repoScout/format.js';

let root;
// Fixture code is built from parts so the repo's own import checker does not
// read these made-up files as real imports.
const imp = (names, from) => `import ${names} from '${from}';`;
const write = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};

beforeEach(() => {
  forgetRepoMaps();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-'));
  write('src/welcome/WelcomeScreen.jsx', [
    "// The first screen a new person sees.",
    imp('{ startButtonLabel }', '../lib/labels.js'),
    "export function WelcomeScreen() {",
    "  return <button className=\"start\">{startButtonLabel}</button>;",
    "}",
  ].join('\n'));
  write('src/lib/labels.js', "export const startButtonLabel = 'Begin';\nexport const stopLabel = 'Stop';\n");
  write('src/App.jsx', `${imp('{ WelcomeScreen }', './welcome/WelcomeScreen')}\nexport default function App() { return <WelcomeScreen />; }\n`);
  write('server/routes/chat.js', "import express from 'express';\nexport const router = express.Router();\nrouter.post('/api/chat', async (req, res) => res.json({}));\nconst MAX_ROUNDS = 30;\n");
  write('tests/labels.test.js', `${imp('{ startButtonLabel }', '../src/lib/labels.js')}\ntest('x', () => expect(startButtonLabel).toBe('Begin'));\n`);
  write('tools/agent.py', "from .helpers import clean\n\ndef run_agent(task):\n    return clean(task)\n\nclass Planner:\n    pass\n");
  write('tools/helpers.py', "def clean(text):\n    return text.strip()\n");
  write('docker/001-init.sql', 'CREATE TABLE IF NOT EXISTS agents (id TEXT);\n');
  write('node_modules/pkg/index.js', 'export const hidden = 1;\n');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('parse', () => {
  test('finds functions, classes, routes, tables and imports with line numbers', () => {
    const js = parseFile('server/routes/chat.js', fs.readFileSync(path.join(root, 'server/routes/chat.js'), 'utf8'));
    expect(js.symbols).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'router', kind: 'const', line: 2, exported: true }),
      expect.objectContaining({ name: 'POST /api/chat', kind: 'route', line: 3 }),
      expect.objectContaining({ name: 'MAX_ROUNDS', line: 4 }),
    ]));
    expect(js.specifiers).toEqual(['express']);
    const py = parseFile('tools/agent.py', fs.readFileSync(path.join(root, 'tools/agent.py'), 'utf8'));
    expect(py.symbols.map((s) => [s.name, s.line])).toEqual([['run_agent', 3], ['Planner', 6]]);
    expect(parseFile('a.sql', 'create table if not exists agent_scout_settings (x int);').symbols[0].name).toBe('agent_scout_settings');
    expect(parseFile('src/welcome/WelcomeScreen.jsx', fs.readFileSync(path.join(root, 'src/welcome/WelcomeScreen.jsx'), 'utf8')).about)
      .toBe('The first screen a new person sees.');
  });

  test('splits identifiers into plain words', () => {
    expect(wordsOf('startButtonLabel MAX_ROUNDS welcome-screen')).toEqual(['start', 'button', 'label', 'max', 'rounds', 'welcome', 'screen']);
    expect(requestWords('Please make the start button say Go')).toEqual(['start', 'button']);
  });
});

describe('map', () => {
  test('links files both ways, skips node_modules, and knows the tests', async () => {
    const map = await getRepoMap(root);
    expect(map.files.has('node_modules/pkg/index.js')).toBe(false);
    expect(map.files.get('src/App.jsx').imports).toEqual(['src/welcome/WelcomeScreen.jsx']);
    expect(map.files.get('tools/agent.py').imports).toEqual(['tools/helpers.py']);
    const labels = describeFile(map, 'src/lib/labels.js');
    expect(labels.usedBy).toEqual(['src/welcome/WelcomeScreen.jsx', 'tests/labels.test.js']);
    expect(labels.usedByIndirectly).toEqual(['src/App.jsx']);
    expect(labels.tests).toEqual(['tests/labels.test.js']);
    expect(overview(map).hubs[0]).toEqual({ path: 'src/lib/labels.js', usedBy: 2 });
    expect(normalizeRelPath(map, 'WelcomeScreen.jsx')).toBe('src/welcome/WelcomeScreen.jsx');
    expect(mapStats(map)).toMatchObject({ files: 8, lastRefresh: { filesRead: 8, firstLook: true } });
  });

  test('stays fresh by reading only what changed', async () => {
    await getRepoMap(root);
    write('src/lib/labels.js', "export const startButtonLabel = 'Start';\nexport function shout() {}\n");
    fs.utimesSync(path.join(root, 'src/lib/labels.js'), new Date(), new Date(Date.now() + 5000));
    write('src/lib/extra.js', `${imp('{ shout }', './labels.js')}\n`);
    fs.rmSync(path.join(root, 'tools/helpers.py'));
    const map = await getRepoMap(root, { force: true });
    expect(map.lastRefresh).toMatchObject({ filesRead: 2, firstLook: false });
    expect(map.files.has('tools/helpers.py')).toBe(false);
    expect(map.files.get('tools/agent.py').imports).toEqual([]);
    expect(describeFile(map, 'src/lib/labels.js').symbols.map((s) => s.name)).toContain('shout');
    expect(describeFile(map, 'src/lib/labels.js').usedBy).toContain('src/lib/extra.js');
  });

  test('says plainly when the folder is not there', async () => {
    await expect(getRepoMap(path.join(root, 'nope'))).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('find where to change', () => {
  const request = 'make the welcome screen start button say Go';

  test('never maps, points at or quotes a file that holds keys, nor sends its words to the scout model', async () => {
    const KEY = 'not-a-real-made-up-key';
    write('config/credentials.json', `{ "start_button_secret": "${KEY}" }\n`);
    write('config/.credentials.json', `{ "start_button_secret": "${KEY}" }\n`);
    const map = await getRepoMap(root);
    expect(map.files.has('config/credentials.json')).toBe(false);
    expect(map.files.has('config/.credentials.json')).toBe(false);
    let sent = '';
    const complete = async (messages) => {
      sent = JSON.stringify(messages);
      return '{"file":"config/credentials.json","line":1}';
    };
    const result = await findWhereToChange(map, 'where is the start button secret set', { complete });
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(sent).not.toContain(KEY);
    expect(result.file).not.toBe('config/credentials.json');
  });

  test('without a model, points from the map with the line and column', async () => {
    const map = await getRepoMap(root);
    const result = await findWhereToChange(map, request);
    expect(result).toMatchObject({ found: true, pickedBy: 'map', file: 'src/welcome/WelcomeScreen.jsx' });
    expect(result.line).toBeGreaterThan(0);
    expect(result.alsoCheck.usedBy).toEqual(['src/App.jsx']);
    expect(result.candidates.map((c) => c.path)).toContain('src/lib/labels.js');
  });

  test('the scout model picks the exact spot among the places the map found', async () => {
    const map = await getRepoMap(root);
    let sent;
    const complete = async (messages) => {
      sent = messages;
      return '```json\n{"file":"src/lib/labels.js","line":1,"column":33,"reason":"The button text comes from this label.","confidence":"high"}\n```';
    };
    const result = await findWhereToChange(map, request, { complete, modelLabel: 'Gemini 3.8 Flash' });
    expect(sent[1].content).toContain('### Place');
    expect(sent[1].content).toContain('src/lib/labels.js');
    expect(result).toMatchObject({
      pickedBy: 'model', model: 'Gemini 3.8 Flash', file: 'src/lib/labels.js', line: 1, column: 33,
      lineText: "export const startButtonLabel = 'Begin';",
    });
    expect(result.alsoCheck.tests).toEqual(['tests/labels.test.js']);
    const text = formatFind({ name: 'demo' }, result);
    expect(text).toContain('Scout (Gemini 3.8 Flash): change src/lib/labels.js at line 1, column 33.');
    expect(text).toContain('make the edit yourself with project_edit');
  });

  test('a model answer outside the places it was shown, or no answer, falls back to the map', async () => {
    const map = await getRepoMap(root);
    const wrong = await findWhereToChange(map, request, { complete: async () => '{"file":"/etc/passwd","line":1}' });
    expect(wrong).toMatchObject({ pickedBy: 'map', file: 'src/welcome/WelcomeScreen.jsx' });
    expect(wrong.modelError).toMatch(/outside the places/);
    const past = await findWhereToChange(map, request, { complete: async () => '{"file":"src/lib/labels.js","line":999}' });
    expect(past.pickedBy).toBe('map');
    const down = await findWhereToChange(map, request, { complete: async () => { throw new Error('429 slow down'); } });
    expect(down.modelError).toMatch(/429 slow down/);
  });

  test('a quoted phrase pins the exact line and column', async () => {
    const map = await getRepoMap(root);
    const result = await findWhereToChange(map, 'change the label "Begin" to "Start"');
    expect(result).toMatchObject({ file: 'src/lib/labels.js', line: 1, column: 34 });
  });

  test('nothing to find says so', async () => {
    const map = await getRepoMap(root);
    expect(await findWhereToChange(map, 'zebra giraffe')).toMatchObject({ found: false, note: expect.stringMatching(/zebra/) });
  });
});

test('scout model messages and answers', () => {
  const msgs = buildScoutMessages('x', [{ path: 'a.js', symbol: 'f', usedBy: 2, snippet: '1: a' }]);
  expect(msgs[0].content).toMatch(/JSON only/);
  expect(parseScoutAnswer('Sure: {"file":"a.js","line":"4","reason":"r"}')).toEqual({ file: 'a.js', line: 4, column: 1, reason: 'r', confidence: 'medium' });
  expect(parseScoutAnswer('no idea')).toBeNull();
});

test('map text for the core agent', async () => {
  const map = await getRepoMap(root);
  expect(formatMapOverview({ name: 'demo' }, map)).toMatch(/Scout map of demo: 8 files/);
  const links = formatFileLinks({ name: 'demo' }, map, 'labels.js');
  expect(links).toContain('line 1: const startButtonLabel (exported)');
  expect(links).toContain('Used by (change these too if the change breaks them): src/welcome/WelcomeScreen.jsx, tests/labels.test.js');
  expect(formatFileLinks({ name: 'demo' }, map, 'missing.js')).toMatch(/has no file/);
});
