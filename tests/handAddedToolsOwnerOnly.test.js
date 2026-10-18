// Tools the owner adds by hand (a file in server/tools/dynamic/ or an MCP
// server in config/mcp_servers.json) can do anything, so a teammate's chat may
// only use one that says it only looks. Everything else is owner-only, like
// the built-in tools that change this computer.
import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Pretend people, never real ones: Pat owns this computer; Mo is a teammate.
const ROLES = { 1: 'admin', 2: 'user' };
const PAT = 1;
const MO = 2;

const ran = jest.fn(async () => 'ran');
const pool = { query: jest.fn(), connect: jest.fn(), on: jest.fn(), end: jest.fn() };
const REGISTRY = { mcp__acme__wipe_disk: ran, mcp__acme__read_status: ran };

jest.unstable_mockModule('../server/db.js', () => ({ default: pool, createDbPool: () => pool }));
jest.unstable_mockModule('../server/memory.js', () => ({
  getAgent: jest.fn(async () => null),
  getSubAgentById: jest.fn(async () => null),
}));
jest.unstable_mockModule('../server/tools/handlers/index.js', () => ({ TOOL_REGISTRY: REGISTRY }));

const { registerHandAddedTool, changesHost } = await import('../server/tools/rbac/hostOwnerOnly.js');
const { OWNER_ONLY_MESSAGE } = await import('../server/security/systemAdmin.js');
const { initializeDynamicTools } = await import('../server/tools/dynamicRegistry.js');
const { executeTool } = await import('../server/tools.js');

const AGENT = 'helper-bot';
const REFUSED = `Error: COMPUTER_OWNER_ONLY: ${OWNER_ONLY_MESSAGE}`;
const dynamicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../server/tools/dynamic');
const FILES = {
  '__jest_hand_deploy.js': "export const definition = { name: 'jest_hand_deploy', description: 'Deploys', parameters: { type: 'object', properties: {} } };\nexport async function handler() { return 'ran'; }\n",
  '__jest_hand_peek.js': "export const looksOnly = true;\nexport const definition = { name: 'jest_hand_peek', description: 'Reads', parameters: { type: 'object', properties: {} } };\nexport async function handler() { return 'ran'; }\n",
};
const priorMode = process.env.CENSAI_MODE;

beforeAll(async () => {
  fs.mkdirSync(dynamicDir, { recursive: true });
  for (const [file, body] of Object.entries(FILES)) fs.writeFileSync(path.join(dynamicDir, file), body);
  await initializeDynamicTools();
  // What initializeMcpTools does for each MCP tool, from its readOnlyHint.
  registerHandAddedTool('mcp__acme__wipe_disk', { looksOnly: undefined });
  registerHandAddedTool('mcp__acme__read_status', { looksOnly: true });
});

afterAll(() => {
  for (const file of Object.keys(FILES)) fs.rmSync(path.join(dynamicDir, file), { force: true });
  if (priorMode === undefined) delete process.env.CENSAI_MODE;
  else process.env.CENSAI_MODE = priorMode;
});

beforeEach(() => {
  ran.mockClear();
  process.env.CENSAI_MODE = 'local_desktop';
  pool.query.mockImplementation(async (_sql, [id]) => ({ rows: ROLES[id] ? [{ role: ROLES[id] }] : [] }));
});

describe('hand-added tools', () => {
  test('count as changes unless they say they only look', () => {
    expect(changesHost('jest_hand_deploy')).toBe(true);
    expect(changesHost('jest_hand_peek')).toBe(false);
    expect(changesHost('mcp__acme__wipe_disk')).toBe(true);
    expect(changesHost('mcp__acme__read_status')).toBe(false);
  });

  test("a teammate's chat cannot run one that changes things", async () => {
    expect(await executeTool(AGENT, 'jest_hand_deploy', {}, { userId: MO })).toBe(REFUSED);
    expect(await executeTool(AGENT, 'mcp__acme__wipe_disk', {}, { userId: MO })).toBe(REFUSED);
    expect(ran).not.toHaveBeenCalled();
  });

  test('a teammate can still use one that only looks', async () => {
    expect(await executeTool(AGENT, 'jest_hand_peek', {}, { userId: MO })).toBe('ran');
    expect(await executeTool(AGENT, 'mcp__acme__read_status', {}, { userId: MO })).toBe('ran');
  });

  test('the owner notices nothing', async () => {
    expect(await executeTool(AGENT, 'jest_hand_deploy', {}, { userId: PAT })).toBe('ran');
    expect(await executeTool(AGENT, 'mcp__acme__wipe_disk', {}, { userId: PAT })).toBe('ran');
  });
});
