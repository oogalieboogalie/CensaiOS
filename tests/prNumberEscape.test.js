import { jest } from '@jest/globals';

// pr_number goes into a GitHub address; a crafted one must not reach another repo.
const fetched = [];
jest.unstable_mockModule('../server/memory.js', () => ({ getSubAgentById: jest.fn(async () => null) }));
jest.unstable_mockModule('../server/workspaces.js', () => ({
  logProjectActivity: jest.fn(), isGithubProject: (p) => Boolean(p?.repo),
}));
jest.unstable_mockModule('../server/tools/helpers.js', () => ({
  resolveProjectForCall: jest.fn(async () => ({ project: { id: 'p1', repo: 'sam-example/board-repo' } })),
  fetchGithub: jest.fn(async (endpoint) => { fetched.push(endpoint); return []; }),
}));

const { prComments, prStatus, mergePr } = await import('../server/tools/handlers/git/pullRequests.js');
const ctx = { workspaceId: 'w1', userId: 2 };

beforeEach(() => { fetched.length = 0; });

test.each([
  ['pr_comments', prComments],
  ['pr_status', prStatus],
  ['merge_pr', mergePr],
])('%s refuses a pr_number that walks out of the board repo', async (_name, fn) => {
  const out = await fn('scout', { pr_number: '1/../../../../pat-example/private-repo/issues?x=' }, ctx);
  expect(out).toMatch(/whole number/);
  expect(fetched).toEqual([]);
});

test('a plain number still reads the board repo', async () => {
  await prComments('scout', { pr_number: 12 }, ctx);
  expect(fetched.length).toBeGreaterThan(0);
  for (const e of fetched) expect(new URL(`https://api.github.com${e}`).pathname).toMatch(/^\/repos\/sam-example\/board-repo\/(pulls|issues)\/12\//);
});
