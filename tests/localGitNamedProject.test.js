import { jest } from '@jest/globals';

// The local git tools (pull, checkpoint, verify) work in the project the call
// names. A name that fits two projects, or no project, is refused: git never
// runs in the folder the app runs from instead. Made-up projects: acme/shop, beta/shop.
const mockRoot = jest.fn();
const mockGit = jest.fn(async (cwd) => ({ ok: true, stdout: `${cwd}\n`, stderr: '' }));

jest.unstable_mockModule('../server/tools/helpers.js', () => ({ resolveLocalProjectRoot: mockRoot }));
jest.unstable_mockModule('../server/tools/handlers/git/shared.js', () => ({
  runGit: mockGit,
  runNpm: jest.fn(),
  formatCommandResult: (label, result) => `${label}: ${result.stdout}`,
}));

const { localGitStatus, localGitFetch } = await import('../server/tools/handlers/git/local.js');

const choice = Object.assign(
  new Error('More than one project is called "shop": "shop" (acme/shop, id shared-shop), "shop" (beta/shop, id shared-shop-0a1b2c3d).'),
  { code: 'PROJECT_NAME_NEEDED' },
);

beforeEach(() => jest.clearAllMocks());

test('a name that fits two projects is refused with the choices, and git runs nowhere', async () => {
  mockRoot.mockRejectedValue(choice);
  await expect(localGitStatus('censai', { project: 'shop' }, {})).rejects.toThrow(/More than one project is called "shop".*acme\/shop.*beta\/shop/);
  await expect(localGitFetch('censai', { project_name: 'shop' }, {})).rejects.toThrow(/More than one project/);
  expect(mockGit).not.toHaveBeenCalled();
});

test('a named project that is not there is refused too, not swapped for the folder the app runs from', async () => {
  mockRoot.mockRejectedValue(new Error('No shared project matching "orchard".'));
  await expect(localGitStatus('censai', { project: 'orchard' }, {})).rejects.toThrow(/No shared project matching "orchard"/);
  expect(mockGit).not.toHaveBeenCalled();
});

test('a call that names no project still works in the folder the app runs from, as before', async () => {
  mockRoot.mockRejectedValue(new Error('No shared project matching "CensaiHub".'));
  const answer = await localGitStatus('censai', {}, {});
  expect(mockGit.mock.calls[0][0]).toBe(process.cwd());
  expect(answer).toContain('Local git status for');
});

test('a named project that is found is where git runs', async () => {
  mockRoot.mockResolvedValue('/made-up/shop');
  await localGitStatus('censai', { project: 'shared-shop' }, {});
  expect(mockRoot).toHaveBeenCalledWith('censai', 'shared-shop', {});
  expect(mockGit.mock.calls[0][0]).toBe('/made-up/shop');
});
