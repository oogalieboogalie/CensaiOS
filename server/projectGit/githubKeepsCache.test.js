import { jest } from '@jest/globals';

// The version bar asks for the files that hold keys GitHub keeps every few
// seconds, so git reads the history once per move of origin's branches: a
// slow or failed read never holds the bar up, a name once seen stays, and
// names from one history never stand for another. git here is a stand-in;
// all names are made up.

const reads = [];
jest.unstable_mockModule('./keptOut.js', () => ({
  keptOutChangedIn: jest.fn((top, revs, options) => new Promise((resolve, reject) => { reads.push({ top, revs, options, resolve, reject }); })),
}));
const { githubKeeps } = await import('./githubKeeps.js');
const names = (...list) => list.map((name) => Buffer.from(name));

beforeEach(() => { reads.length = 0; });
afterEach(() => { jest.restoreAllMocks(); });

test('one read per move of the branches, none without any, and new names are kept', async () => {
  const keep = jest.fn(async () => {});
  expect(await githubKeeps('/made-up/one', { tips: '', kept: [], keep })).toEqual([]);
  expect(await githubKeeps('/made-up/one', { tips: null, kept: ['.env'], keep })).toEqual(['.env']);
  expect(reads).toHaveLength(0);

  const first = githubKeeps('/made-up/one', { tips: 'aaa', kept: [], keep });
  expect(reads).toEqual([expect.objectContaining({ top: '/made-up/one', revs: ['--remotes=origin'] })]);
  reads[0].resolve(names('certs/made-up.key', '.env'));
  expect(await first).toEqual(['.env', 'certs/made-up.key']);
  expect(keep).toHaveBeenLastCalledWith(['.env', 'certs/made-up.key']);
  expect(await githubKeeps('/made-up/one', { tips: 'aaa', kept: ['.env', 'certs/made-up.key'], keep })).toEqual(['.env', 'certs/made-up.key']);
  expect(keep).toHaveBeenCalledTimes(1);
  expect(reads).toHaveLength(1);

  // Another project has its own read.
  const other = githubKeeps('/made-up/two', { tips: 'aaa', kept: [], keep });
  reads[1].resolve([]);
  expect(await other).toEqual([]);
  expect(reads).toHaveLength(2);
});

test('a name once seen stays when the branch that held it is gone', async () => {
  const first = githubKeeps('/made-up/three', { tips: 'aaa bbb', kept: [] });
  reads[0].resolve(names('.env'));
  expect(await first).toEqual(['.env']);
  // That branch was deleted on GitHub: the read of what is left finds nothing, and the kept name stays.
  const after = githubKeeps('/made-up/three', { tips: 'aaa', kept: ['.env'] });
  reads[1].resolve([]);
  expect(await after).toEqual(['.env']);
});

test('a read git cannot finish leaves the names kept, and runs again only after a while or once the branches move', async () => {
  const failed = githubKeeps('/made-up/four', { tips: 'aaa', kept: ['.env'] });
  reads[0].reject(Object.assign(new Error('made-up: git stopped'), { git: true }));
  expect(await failed).toEqual(['.env']);
  expect(await githubKeeps('/made-up/four', { tips: 'aaa', kept: ['.env'] })).toEqual(['.env']);
  expect(reads).toHaveLength(1);

  const now = Date.now();
  jest.spyOn(Date, 'now').mockReturnValue(now + 11 * 60_000);
  const again = githubKeeps('/made-up/four', { tips: 'aaa', kept: ['.env'] });
  expect(reads).toHaveLength(2);
  reads[1].resolve(names('.env', 'made-up.pem'));
  expect(await again).toEqual(['.env', 'made-up.pem']);
});

test('a long read never holds the bar up, and names from another history never stand for a new one', async () => {
  const first = githubKeeps('/made-up/five', { tips: 'aaa', kept: [] });
  reads[0].resolve(names('.env'));
  expect(await first).toEqual(['.env']);

  // Another project cloned into the same folder: nothing kept yet, and the old read's names are not its own.
  const started = Date.now();
  expect(await githubKeeps('/made-up/five', { tips: 'ccc', kept: [] })).toEqual([]);
  expect(Date.now() - started).toBeLessThan(5_000);
  expect(reads[1].options).toEqual({ timeout: expect.any(Number) });
  reads[1].resolve(names('made-up.key'));
  expect(await githubKeeps('/made-up/five', { tips: 'ccc', kept: [] })).toEqual(['made-up.key']);
  expect(reads).toHaveLength(2);
}, 15_000);

test('settings that cannot be written now are written at a later look', async () => {
  const keep = jest.fn().mockRejectedValueOnce(new Error('made-up: settings busy')).mockResolvedValue();
  const first = githubKeeps('/made-up/six', { tips: 'aaa', kept: [], keep });
  reads[0].resolve(names('.env'));
  expect(await first).toEqual(['.env']);
  expect(await githubKeeps('/made-up/six', { tips: 'aaa', kept: [], keep })).toEqual(['.env']);
  expect(keep).toHaveBeenCalledTimes(2);
});
