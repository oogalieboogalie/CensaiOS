import { jest } from '@jest/globals';

// github_read_file, as the chat's tool list calls it, reads with this
// computer's GitHub key for whoever drives the chat: Sam Example's agent (a
// teammate) gets plain words for a file that holds keys, Pat Example's (the
// owner's) reads it. GitHub is made up here.
const PEOPLE = { 1: { role: 'admin' }, 2: { role: 'user' } };
const pool = { query: jest.fn(async (_sql, params) => ({ rows: PEOPLE[params?.[0]] ? [PEOPLE[params[0]]] : [] })) };
jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));
process.env.GITHUB_TOKEN = 'made-up-token';

const { TOOL_REGISTRY } = await import('../server/tools/handlers/index.js');
const { FILE_PROBLEMS } = await import('../shared/files/fileProblems.js');
const { LINKED_SECRET, OWNER_ONLY_FILE } = await import('../server/security/secretFiles.js');
const { projectRead } = await import('../server/workspaces/read.js');

// GitHub follows a link in a repo and answers with the file it leads to:
// here docs/made-up-link.md leads to the repo's .env.
const KEY = 'not-a-real-made-up-key';
const answer = (url) => (String(url).endsWith('/docs/made-up-link.md')
  ? { type: 'file', path: '.env', content: Buffer.from(`MADE_UP_KEY=${KEY}`).toString('base64') }
  : { type: 'file', content: Buffer.from(`Made-up words of ${url}`).toString('base64') });

beforeEach(() => {
  global.fetch = jest.fn(async (url) => ({ ok: true, status: 200, json: async () => answer(url) }));
});
afterAll(() => {
  delete global.fetch;
  delete process.env.GITHUB_TOKEN;
});

const readAs = (userId, path) => TOOL_REGISTRY.github_read_file('made-up-agent', 'github_read_file', { repo: 'made-up/repo', path }, { userId });

test("Sam's agent gets plain words for a .env, and GitHub is never asked", async () => {
  expect(await readAs(2, '.env')).toBe(`Error: ${FILE_PROBLEMS.ownerOnly}`);
  expect(global.fetch).not.toHaveBeenCalled();
});

test("Pat's agent reads it, and Sam's agent reads an ordinary file", async () => {
  expect(await readAs(1, '.env')).toBe('Made-up words of https://api.github.com/repos/made-up/repo/contents/.env');
  expect(await readAs(2, 'notes.md')).toBe('Made-up words of https://api.github.com/repos/made-up/repo/contents/notes.md');
});

test("no one's agent reads a file that holds keys through a link in the repo, with github_read_file or project_read", async () => {
  for (const who of [1, 2]) expect(await readAs(who, 'docs/made-up-link.md')).toBe(`Error: ${LINKED_SECRET}`);
  await expect(projectRead({ repo: 'made-up/repo' }, 'docs/made-up-link.md')).rejects.toMatchObject({ code: OWNER_ONLY_FILE, message: LINKED_SECRET });
  expect(await projectRead({ repo: 'made-up/repo' }, 'notes.md')).toBe('Made-up words of https://api.github.com/repos/made-up/repo/contents/notes.md');
});
