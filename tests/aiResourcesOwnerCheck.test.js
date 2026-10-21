import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

// The AI resources window decides who is the owner the same way every other
// owner-only screen does (assertSystemAdmin: the role saved in the
// database), never by the session's copy of the role. Fake people only.
const mockPool = { query: jest.fn() };
const logLines = [];
jest.unstable_mockModule('../server/db.js', () => ({ default: mockPool }));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/memory/core/agents.js', () => ({ getAgents: async () => [] }));
jest.unstable_mockModule('../server/cli-agents/index.js', () => ({
  cliRoster: async () => [{ id: 'claudecode', label: 'Claude Code', vendor: 'Anthropic', installed: true, signedIn: true, signedInVia: 'cli-login', running: false }],
  getCliTaskManager: () => ({ list: () => [] }),
}));
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: (name) => Object.fromEntries(['info', 'warn', 'error', 'debug'].map((level) => [level, (message, meta) => logLines.push({ name, level, message, meta })])),
}));

const { default: express } = await import('express');
const { buildAiResources } = await import('../server/aiResources/summary.js');
const { setKeySharing, resetKeySharingCache } = await import('../server/security/keySharing.js');
const { aiResourcesRouter } = await import('../server/routes/aiResources.js');

const USERS = [
  { id: 1, name: 'Pat Example', role: 'admin' },
  { id: 2, name: 'Sam Example', role: 'member' },
  { id: 3, name: 'Mo Example', role: 'member' },
];
let dir;

const deps = { agentDefaults: async () => ({ fallback: null, defaultLocal: true }) };

function app(userId, userRole) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => { req.session = { userId, userRole }; next(); });
  server.use('/api/ai-resources', aiResourcesRouter);
  return server;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'air-owner-'));
  process.env.HOMEBASE_STATE_DIR = dir;
  process.env.CENSAI_ENV_KEYS = 'off';
  process.env.CENSAI_CLI_AGENT_HOME = dir;
  fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'pat@testco.example' } }));
  resetKeySharingCache();
  setKeySharing(2, true);
  logLines.length = 0;
  mockPool.query.mockImplementation(async (sql, params = []) => {
    if (/SELECT role FROM users/.test(sql)) return { rows: [{ role: USERS.find((u) => u.id === Number(params[0]))?.role || null }] };
    if (/FROM users/.test(sql)) return { rows: USERS };
    return { rows: [] };
  });
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.CENSAI_CLI_AGENT_HOME;
});

const refusals = () => logLines.filter((l) => l.name === 'ai-resources' && l.message === 'owner view refused');

describe('AI resources owner view', () => {
  test('the owner (admin in the database) sees CLI account names and the key-sharing list', async () => {
    const view = await buildAiResources({ userId: 1, userRole: 'admin', deps });
    expect(view.owner).toBe(true);
    expect(view.clis[0].account).toBe('pat@testco.example');
    expect(view.sharing).toEqual({ available: true, canManage: true, sharedWith: ['Sam Example'] });
    expect(refusals()).toHaveLength(0);
  });

  test('a teammate sees neither, and the refusal is logged with the account id only', async () => {
    const view = await buildAiResources({ userId: 2, userRole: 'member', deps });
    expect(view.owner).toBe(false);
    expect(view.clis[0]).toMatchObject({ account: null, accountHidden: true });
    expect(view.sharing).toEqual({ available: true, canManage: false, sharedWithMe: true });
    expect(refusals()).toEqual([{ name: 'ai-resources', level: 'info', message: 'owner view refused', meta: { account: 2 } }]);
    expect(JSON.stringify(logLines)).not.toMatch(/Sam|Pat|@/);
  });

  test('a session that says admin does not get the owner view when the database says member', async () => {
    const res = await request(app(3, 'admin')).get('/api/ai-resources');
    expect(res.status).toBe(200);
    expect(res.body.owner).toBe(false);
    expect(res.body.clis[0]).toMatchObject({ account: null, accountHidden: true });
    expect(res.body.sharing.canManage).toBe(false);
    expect(res.body.sharing.sharedWith).toBeUndefined();
    expect(refusals().map((l) => l.meta)).toEqual([{ account: 3 }]);
  });

  test('a database hiccup shows the not-owner view instead of failing the window', async () => {
    mockPool.query.mockImplementation(async (sql) => {
      if (/SELECT role FROM users/.test(sql)) throw new Error('connection reset');
      return { rows: [] };
    });
    const view = await buildAiResources({ userId: 1, userRole: 'admin', deps });
    expect(view.owner).toBe(false);
    expect(logLines.some((l) => l.level === 'warn' && l.message.startsWith('owner check failed'))).toBe(true);
  });
});
