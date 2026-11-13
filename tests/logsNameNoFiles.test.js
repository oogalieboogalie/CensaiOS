import express from 'express';
import request from 'supertest';
import * as Y from 'yjs';
import { onLogRecord } from '../server/logger.js';
import { requestLogger } from '../server/boot/requestLog.js';
import { upsertWindowInDoc } from '../server/collab/serverWriter.js';
import { followFileInPreview, showInChatPreview } from '../server/collaboration/chatPreview.js';
import { createAgentImportProjectRouter } from '../server/routes/agentImportProject.js';
import { createAgentImportGithubRouter } from '../server/routes/agentImportGithub.js';

// The server's log is a file on this computer that agents read when asked
// about a bug. It says what happened and why, never the file, folder or repo
// someone asked for, nor their words. Everything here is made up.
const FOLDER = '/made-up-home/pat-example/made-up-project';
const FILE = `${FOLDER}/made-up-plans/made-up-budget.md`;
const REPO = 'pat-example/made-up-repo';
const WORDS = 'made-up birthday surprise';
const NAMED = ['pat-example', 'made-up-project', 'made-up-plans', 'made-up-budget', 'made-up-repo', 'birthday', 'made-up-helper', 'made-up-branch'];
const q = encodeURIComponent;

/** The words of `lines` that name something made up above. */
const naming = (lines) => lines.filter((line) => NAMED.some((name) => line.includes(name) || line.includes(q(name))));

describe('the request log', () => {
  function appWithLog() {
    const lines = [];
    const log = Object.fromEntries(['error', 'warn', 'info', 'debug'].map((level) => [level, (line) => lines.push(`${level} ${line}`)]));
    const app = express();
    app.use(requestLogger(log));
    app.use((_req, res) => res.json({ ok: true }));
    return { app, lines };
  }

  // What the app's windows really ask, and what the log keeps of each.
  const ASKED = [
    [`/api/files/content?path=${q(FILE)}`, 'GET /api/files/content?path=[redacted] 200'],
    [`/api/files/browse?path=${q(FOLDER)}&details=1`, 'GET /api/files/browse?path=[redacted]&details=1 200'],
    [`/api/files/search?path=${q(FOLDER)}&q=${q(WORDS)}`, 'GET /api/files/search?path=[redacted]&q=[redacted] 200'],
    [`/api/project-git/status?path=${q(FOLDER)}`, 'debug GET /api/project-git/status?path=[redacted] 200'],
    [`/api/github/file?repo=${q(REPO)}&path=made-up-plans%2Fmade-up-budget.md`, 'GET /api/github/file?repo=[redacted]&path=[redacted] 200'],
    [`/api/cli-agents/tasks/t-1/file?path=${q('made-up-plans/made-up-budget.md')}`, 'GET /api/cli-agents/tasks/t-1/file?path=[redacted] 200'],
    [`/api/youtube/search?q=${q(WORDS)}&shorts=1&maxResults=25`, 'GET /api/youtube/search?q=[redacted]&shorts=1&maxResults=25 200'],
    [`/api/design/figma/frames?url=${q('https://www.figma.com/file/made-up/made-up-budget')}`, 'GET /api/design/figma/frames?url=[redacted] 200'],
    ['/api/files/content?path=made-up-plans/made-up+budget.md', 'GET /api/files/content?path=[redacted] 200'],
    [`/api/files/content?${q(FILE)}`, 'GET /api/files/content?[redacted] 200'],
    // A plain name holding a path or words is hidden too, however it is written.
    [`/api/files/browse?type=${q(FOLDER)}&workspaceId=${q(WORDS)}`, 'GET /api/files/browse?type=[redacted]&workspaceId=[redacted] 200'],
    [`/api/files/browse?limit=5?path=${FOLDER}`, 'GET /api/files/browse?limit=[redacted] 200'],
  ];

  test.each(ASKED)('%s is logged as %s, naming nothing', async (asked, logged) => {
    const { app, lines } = appWithLog();
    await request(app).get(asked);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(logged);
    expect(naming(lines)).toEqual([]);
  });

  test('ids, counts, dates and switches stay, so the log still says what was asked', async () => {
    const { app, lines } = appWithLog();
    await request(app).get('/api/workspaces?workspaceId=made-up-board&limit=5&since=2026-10-30&details=1&Status=open');
    await request(app).post(`/api/files/content?path=${q(FILE)}&workspaceId=made-up-board`);
    expect(lines[0]).toContain('GET /api/workspaces?workspaceId=made-up-board&limit=5&since=2026-10-30&details=1&Status=open 200');
    expect(lines[1]).toContain('POST /api/files/content?path=[redacted]&workspaceId=made-up-board 200');
  });
});

describe('the chat live preview', () => {
  const CHAT = { id: 'chat-1', kind: 'chat', agentId: 'atlas', x: 100, y: 80, w: 420, h: 560 };
  const project = { name: 'made-up-project', path: FOLDER };
  const page = 'made-up-plans/made-up-budget.html';
  const readFile = async () => `<h1>${WORDS}</h1>`;
  let records;
  let stop;

  beforeEach(() => {
    records = [];
    stop = onLogRecord((record) => { if (record.namespace === 'chat-preview') records.push(record); });
  });
  afterEach(() => stop());

  function board(extra = []) {
    const doc = new Y.Doc();
    for (const win of [CHAT, ...extra]) upsertWindowInDoc(doc, win);
    return { transact: async (_id, mutate) => { doc.transact(() => mutate(doc)); return true; } };
  }
  const lines = () => records.map((record) => `${record.message} ${JSON.stringify(record.meta ?? {})}`);

  test('opening and refreshing a preview logs what kind of file, never its name or path', async () => {
    const deps = board();
    expect((await followFileInPreview({ workspaceId: 'w', chatWindowId: 'chat-1', agentId: 'atlas', project, filePath: page, readFile }, deps)).status).toBe('opened');
    expect((await followFileInPreview({ workspaceId: 'w', chatWindowId: 'chat-1', agentId: 'atlas', project, filePath: page, readFile }, deps)).status).toBe('refreshed');
    expect(records.map((record) => [record.message, record.meta.type])).toEqual([['preview opened', 'html'], ['preview refreshed', 'html']]);
    expect(naming(lines())).toEqual([]);
  });

  test('a write that Run dev already shows is logged without the file', async () => {
    const dev = { id: 'dev-1', kind: 'devServer', folder: `${FOLDER}/`, x: 900, y: 80, w: 520, h: 420 };
    const shown = await followFileInPreview({ workspaceId: 'w', chatWindowId: 'chat-1', agentId: 'atlas', project, filePath: page, readFile }, board([dev]));
    expect(shown.status).toBe('dev');
    expect(records.map((record) => [record.message, record.meta.kind])).toEqual([['write follows Run dev', 'html']]);
    expect(naming(lines())).toEqual([]);
  });

  test('a preview type a model makes up is logged as other, never as written', async () => {
    const shown = await showInChatPreview('w', {
      chatWindowId: 'chat-1', agentId: 'atlas', title: 'made-up-budget', fileName: 'made-up-budget.html',
      html: `<p>${WORDS}</p>`, previewType: `${WORDS} planner`,
    }, board());
    expect(shown.created).toBe(true);
    expect(records.map((record) => [record.message, record.meta.type])).toEqual([['preview opened', 'other']]);
    expect(naming(lines())).toEqual([]);
  });
});

describe('pulling helpers into Import agent', () => {
  let records;
  let stop;

  beforeEach(() => {
    records = [];
    stop = onLogRecord((record) => { if (record.namespace === 'agent-import') records.push(record); });
  });
  afterEach(() => stop());

  function importApp() {
    const helpers = { agents: [{ name: 'made-up-helper', platform: 'claude' }], skipped: [{ file: 'made-up-budget.md', why: 'no name' }], capped: false };
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.session = { userId: 1, userRole: 'admin' }; next(); });
    app.use('/project', createAgentImportProjectRouter({
      requireOwner: (_req, _res, next) => next(),
      readCurrentProject: async () => project(),
      resolveProjectPath: (folder) => folder,
      listProjectClaudeHelpers: async (root) => ({ folder: `${root}/.claude/agents`, ...helpers }),
    }));
    app.use('/github', createAgentImportGithubRouter({
      getUserApiKeyConfig: async () => ({ apiKey: 'made-up-key' }),
      listRepoAgents: async (repo) => ({ repo, branch: 'made-up-branch', ...helpers }),
    }));
    return app;
  }
  const project = () => ({ name: 'made-up-project', path: FOLDER });

  test("a project's helpers and a repo's are logged as counts, never the folder, the repo or a helper's name", async () => {
    const app = importApp();
    expect((await request(app).post('/project')).status).toBe(200);
    expect((await request(app).post('/project/imported').send({ names: ['made-up-helper'] })).status).toBe(200);
    expect((await request(app).post('/github').send({ repo: REPO })).status).toBe(200);
    expect((await request(app).post('/github/imported').send({ repo: REPO, names: ['made-up-helper'] })).status).toBe(200);
    const lines = records.map((record) => `${record.message} ${JSON.stringify(record.meta ?? {})}`);
    expect(records.map((record) => record.message)).toEqual([
      'agent-import: project pull: found 1, skipped 1',
      'agent-import: project pull: imported 1',
      'agent-import: github pull: found 1 (claude 1), skipped 1',
      'agent-import: github pull: imported 1',
    ]);
    expect(naming(lines)).toEqual([]);
  });
});
