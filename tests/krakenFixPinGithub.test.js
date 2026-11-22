import { jest } from '@jest/globals';

// A fix is pinned to the GitHub project itself, never to a folder here that holds the same
// code (server/censaiOrchestrator/planProject.js keepGithub, projectPin.js resolvePin): its
// pull request goes to GitHub. Made-up projects: "Cloud" (acme/shop on GitHub, last opened
// from D:\Repos\shop) and "Shop here", a project the board has for that same folder.

const CLOUD = { id: 'p-cloud', name: 'Cloud', repo: 'acme/shop', path: 'D:\\Repos\\shop' };
const HERE = { id: 'p-here', name: 'Shop here', repo: null, path: 'D:\\Repos\\shop' };
const denied = () => Object.assign(new Error('not on this board'), { code: 'PROJECT_ACCESS_DENIED' });

jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(async () => ({ rows: [] })), on: jest.fn() } }));
jest.unstable_mockModule('../server/workspaces/projectAccess.js', () => ({
  // The board gives Censai only the folder project; GitHub's row is found by the owner's lookup.
  resolveAuthorizedWorkspaceProject: jest.fn(async (_db, { projectIdentifier }) => {
    if ([HERE.id, HERE.name, HERE.path].includes(projectIdentifier)) return HERE;
    throw denied();
  }),
}));
jest.unstable_mockModule('../server/workspaces/ownerProjectLookup.js', () => ({
  resolveProjectForDriver: jest.fn(async (_db, { projectIdentifier }) => {
    if ([CLOUD.id, CLOUD.name, CLOUD.repo].includes(projectIdentifier)) return CLOUD;
    throw Object.assign(new Error('no such project'), { code: 'PROJECT_NOT_FOUND' });
  }),
}));

const { planProject } = await import('../server/censaiOrchestrator/planProject.js');
const { resolvePin } = await import('../server/censaiOrchestrator/projectPin.js');

const WHO = { workspaceId: 'ws-1', userId: 7 };
const heads = { repoHead: async () => ({ branch: 'main', commit: 'a'.repeat(40) }), folderHead: async () => ({ branch: 'main', commit: null }) };

test('a write-up keeps finding the folder here for a GitHub row, as before', async () => {
  expect((await planProject({}, { ...WHO, project: 'acme/shop' })).id).toBe('p-here');
});

test('a fix keeps the GitHub project, so its pin is the GitHub repo', async () => {
  expect((await planProject({}, { ...WHO, project: 'acme/shop', keepGithub: true })).id).toBe('p-cloud');
  const pin = await resolvePin({}, WHO, { project: 'acme/shop', tests: true }, heads);
  expect(pin).toEqual(expect.objectContaining({ projectId: 'p-cloud', kind: 'github', source: 'acme/shop' }));
});
