import { jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A project is where its files live: the full owner/repo on GitHub, or the
// folder on this computer. Two projects that only share a name (acme/shop and
// beta/shop, or a repo and a folder both called shop) are two projects with
// two ids, and opening one never changes the other's row.
//
// The made-up database below answers the questions server/workspaces/projects.js
// asks, the way Postgres does. When a real Postgres answers (E2E_DATABASE_URL,
// the one the end-to-end check and the test team use, or
// PROJECT_IDENTITY_DATABASE_URL to point somewhere else), the same tests run
// on it instead and docker/098-project-identity.sql is run for real. They keep
// to a schema of their own, made for this run and dropped after, so nothing
// else in that database is read or changed.

async function reachableDatabaseUrl() {
  const candidate = process.env.PROJECT_IDENTITY_DATABASE_URL || process.env.E2E_DATABASE_URL || '';
  if (!candidate) return '';
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: candidate, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return candidate;
  } catch {
    return ''; // quiet: no database on this runner, so the made-up one answers
  } finally {
    await client.end().catch(() => {}); // quiet: it never connected
  }
}

const realUrl = await reachableDatabaseUrl();
const MIGRATION = path.resolve('docker/098-project-identity.sql');

const lower = (v) => String(v ?? '').toLowerCase();
const slashes = (v) => lower(v).replace(/\\/g, '/');
const sameFolder = (a, b) => a === b || (/^[a-z]:/i.test(String(b)) && slashes(a) === slashes(b));
const lastPart = (repo) => String(repo || '').replace(/^.*\//, '');

function madeUpDatabase() {
  let rows = [];
  let clock = 0;
  const stamp = () => new Date(Date.UTC(2026, 0, 1, 0, 0, clock += 1));
  const newestFirst = (ownerId) => (a, b) => (
    ((a.owner_agent_id === ownerId ? 0 : 1) - (b.owner_agent_id === ownerId ? 0 : 1)) || (b.updated_at - a.updated_at)
  );
  const cut = (text, list) => list.slice(0, Number(/LIMIT (\d+)/.exec(text)?.[1] || list.length)).map((row) => ({ ...row }));

  async function query(sql, params = []) {
    const text = String(sql).replace(/\s+/g, ' ').trim();
    if (text.startsWith('INSERT INTO projects')) {
      const github = text.includes('VALUES ($1, $2, $3, NULL, $4, $5)');
      const [id, owner, name, place, summary] = params;
      const row = rows.find((r) => r.id === id);
      if (!row) {
        const made = { id, owner_agent_id: owner, name, path: github ? null : place, repo: github ? place : null, summary, created_at: stamp(), updated_at: stamp() };
        rows.push(made);
        return { rows: [{ ...made, is_new: true }] };
      }
      // "ON CONFLICT (id) DO UPDATE ... WHERE <the same project>": no WHERE means every clash is written over.
      const guarded = / WHERE /.test(text.split('ON CONFLICT')[1]);
      if (guarded) {
        const same = github
          ? (row.repo ? lower(row.repo) === lower(place) : !row.path)
          : ((!row.repo && !row.path) || (row.path && sameFolder(row.path, place)));
        if (!same) return { rows: [] };
        if (github && !row.repo) row.repo = place;
        if (!github && !row.path) row.path = place;
      } else if (github) row.repo = place;
      else row.path = place;
      row.summary = summary ?? row.summary;
      row.updated_at = stamp();
      return { rows: [{ ...row, is_new: false }] };
    }
    if (text === 'SELECT * FROM projects ORDER BY id') return { rows: cut(text, [...rows].sort((a, b) => a.id.localeCompare(b.id))) };
    if (text === 'SELECT * FROM projects WHERE id = $1') return { rows: cut(text, rows.filter((r) => r.id === params[0])) };
    if (text.startsWith('SELECT * FROM projects WHERE lower(name) = lower($2)')) {
      return { rows: cut(text, rows.filter((r) => lower(r.name) === lower(params[1])).sort(newestFirst(params[0]))) };
    }
    if (text.startsWith('SELECT * FROM projects WHERE repo = $1') || text.startsWith('SELECT * FROM projects WHERE lower(repo) = lower($1)')) {
      return { rows: cut(text, rows.filter((r) => lower(r.repo) === lower(params[0])).sort(newestFirst(null))) };
    }
    if (text.startsWith('SELECT * FROM projects WHERE ($1::text IS NOT NULL AND (path = $1 OR')) {
      const [folder, name] = params;
      const hits = rows.filter((r) => (folder && r.path && sameFolder(r.path, folder)) || (!r.path && !r.repo && lower(r.name) === lower(name)));
      const rank = (r) => (!r.path ? 2 : r.repo ? 1 : 0);
      return { rows: cut(text, hits.sort((a, b) => rank(a) - rank(b) || newestFirst('shared')(a, b))) };
    }
    if (text.startsWith('SELECT * FROM projects WHERE ($1::text IS NOT NULL AND path = $1) OR lower(name) = lower($2)')) {
      const [folder, name] = params;
      return { rows: cut(text, rows.filter((r) => (folder && r.path === folder) || lower(r.name) === lower(name)).sort(newestFirst('shared'))) };
    }
    if (text.startsWith('SELECT * FROM projects WHERE repo = $2') || text.startsWith('SELECT * FROM projects WHERE (repo = $2 OR lower(repo) = lower($2))')) {
      const value = params[1];
      const hits = rows.filter((r) => lower(r.repo) === lower(value)
        || (!String(value).includes('/') && r.repo && lower(lastPart(r.repo)) === lower(value))
        || (r.path && sameFolder(r.path, value)));
      return { rows: cut(text, hits.sort(newestFirst(params[0]))) };
    }
    throw new Error(`the made-up database has no answer for: ${text.slice(0, 80)}`);
  }

  return {
    pool: { query },
    reset: async () => { rows = []; },
    seed: async (row) => { rows.push({ path: null, repo: null, summary: null, owner_agent_id: 'architect', created_at: stamp(), updated_at: stamp(), ...row }); },
    close: async () => {},
  };
}

async function realDatabase(url) {
  const { default: pg } = await import('pg');
  const schema = `project_identity_${process.pid}_${Date.now()}`;
  const admin = new pg.Pool({ connectionString: url, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: url, max: 2, options: `-c search_path=${schema}` });
  // The projects table as docker/005-workspaces.sql and 006-github-projects.sql leave it.
  const oldTable = `
    DROP TABLE IF EXISTS projects;
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, owner_agent_id TEXT NOT NULL, name TEXT NOT NULL, path TEXT, repo TEXT, summary TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(owner_agent_id, name)
    );`;
  return {
    pool,
    migrate: () => pool.query(fs.readFileSync(MIGRATION, 'utf8')),
    reset: async ({ migrate = true } = {}) => {
      await pool.query(oldTable);
      if (migrate && fs.existsSync(MIGRATION)) await pool.query(fs.readFileSync(MIGRATION, 'utf8'));
    },
    seed: (row) => pool.query(
      'INSERT INTO projects (id, owner_agent_id, name, path, repo) VALUES ($1, $2, $3, $4, $5)',
      [row.id, row.owner_agent_id || 'architect', row.name, row.path || null, row.repo || null],
    ),
    close: async () => {
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    },
  };
}

const store = realUrl ? await realDatabase(realUrl) : madeUpDatabase();

jest.unstable_mockModule('../server/db.js', () => ({ default: store.pool }));
jest.unstable_mockModule('../server/github.js', () => ({ getRepoInfo: jest.fn(async () => ({})) }));
jest.unstable_mockModule('../server/workspaces/briefs.js', () => ({ refreshProjectBrief: jest.fn() }));
jest.unstable_mockModule('../server/workspaces/activity.js', () => ({ logProjectActivity: jest.fn() }));

const { openProject, getProject, getProjectByName, getProjectByRepoOrPath } = await import('../server/workspaces/projects.js');

const allRows = async () => (await store.pool.query('SELECT * FROM projects ORDER BY id')).rows;
const row = async (id) => (await allRows()).find((r) => r.id === id);

let home;
let folders;
const priorRoot = process.env.CENSAIHUB_WORKSPACES_ROOT;
afterAll(() => {
  if (priorRoot === undefined) delete process.env.CENSAIHUB_WORKSPACES_ROOT;
  else process.env.CENSAIHUB_WORKSPACES_ROOT = priorRoot;
});
beforeEach(async () => {
  await store.reset();
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-project-identity-'));
  // Where a project opened by name alone gets its new folder.
  process.env.CENSAIHUB_WORKSPACES_ROOT = path.join(home, 'workspaces');
  folders = { one: path.join(home, 'one', 'shop'), two: path.join(home, 'two', 'shop') };
  for (const folder of Object.values(folders)) fs.mkdirSync(folder, { recursive: true });
});
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));
afterAll(() => store.close());

describe(`two projects with one name (${realUrl ? 'real Postgres' : 'made-up database'})`, () => {
  test('1. acme/shop then beta/shop: two rows, two ids, and the first still points at acme/shop', async () => {
    const acme = await openProject('architect', { repo: 'acme/shop' });
    const beta = await openProject('architect', { repo: 'beta/shop' });

    expect(acme.id).toBe('shared-shop');
    expect(beta.id).not.toBe(acme.id);
    expect(beta.id).toMatch(/^shared-shop-[0-9a-f]{8}$/);
    expect(beta.repo).toBe('beta/shop');
    expect(await allRows()).toHaveLength(2);
    expect((await row(acme.id)).repo).toBe('acme/shop');
    expect((await getProject(acme.id)).repo).toBe('acme/shop');
  });

  test('2. a folder called shop after GitHub acme/shop: two ids, neither one re-pointed', async () => {
    const acme = await openProject('architect', { repo: 'acme/shop' });
    const folder = await openProject('architect', { existingPath: folders.one });
    const other = await openProject('architect', { existingPath: folders.two });

    expect(new Set([acme.id, folder.id, other.id]).size).toBe(3);
    expect(await allRows()).toHaveLength(3);
    const kept = await row(acme.id);
    expect(kept.repo).toBe('acme/shop');
    expect(kept.path).toBeNull();
    expect((await row(folder.id)).repo).toBeNull();
    expect((await row(folder.id)).path).toBe(folders.one);
    expect((await row(other.id)).path).toBe(folders.two);
  });

  test('3. opening acme/shop again gives the same id and no new row', async () => {
    const first = await openProject('architect', { repo: 'acme/shop' });
    await openProject('architect', { repo: 'beta/shop' });
    const second = await openProject('atlas', { repo: 'acme/shop' });
    const capitals = await openProject('architect', { repo: 'Acme/Shop' });
    const betaAgain = await openProject('architect', { repo: 'beta/shop' });
    const folder = await openProject('architect', { existingPath: folders.one });
    const folderAgain = await openProject('architect', { existingPath: folders.one });

    expect(second.id).toBe(first.id);
    expect(capitals.id).toBe(first.id);
    expect(folderAgain.id).toBe(folder.id);
    expect(await allRows()).toHaveLength(3);
    expect((await row(first.id)).repo).toBe('acme/shop');
    expect((await row(betaAgain.id)).repo).toBe('beta/shop');
  });

  test('4. a row from before keeps its id when it is opened again', async () => {
    // Before this change the short id went to whichever "shop" was opened; here beta/shop has it.
    await store.seed({ id: 'shared-shop', name: 'shop', repo: 'beta/shop' });
    await store.seed({ id: 'architect-old-notes', name: 'notes', path: folders.one, owner_agent_id: 'atlas' });

    const beta = await openProject('architect', { repo: 'beta/shop' });
    const notes = await openProject('architect', { name: 'notes', existingPath: folders.one });
    const acme = await openProject('architect', { repo: 'acme/shop' });

    expect(beta.id).toBe('shared-shop');
    expect(notes.id).toBe('architect-old-notes');
    expect(acme.id).not.toBe('shared-shop');
    expect((await row('shared-shop')).repo).toBe('beta/shop');
    expect((await row('architect-old-notes')).path).toBe(folders.one);
    expect(await allRows()).toHaveLength(3);
  });

  test('5. a bare name that fits two projects names them instead of picking one', async () => {
    const acme = await openProject('architect', { repo: 'acme/shop' });
    const beta = await openProject('architect', { repo: 'beta/shop' });

    await expect(getProjectByName('architect', 'shop')).rejects.toThrow(/More than one project is called "shop".*acme\/shop.*beta\/shop|More than one project is called "shop".*beta\/shop.*acme\/shop/);
    await expect(getProjectByRepoOrPath('architect', 'shop')).rejects.toThrow(/More than one project/);
    // Its full repo and its id are exact: each finds its own project.
    expect((await getProjectByRepoOrPath('architect', 'acme/shop')).id).toBe(acme.id);
    expect((await getProjectByRepoOrPath('architect', 'beta/shop')).id).toBe(beta.id);
    expect((await getProject(beta.id)).repo).toBe('beta/shop');
  });

  test('6. open_project with only a name gives the project that has that name, and makes one only when none has', async () => {
    const acme = await openProject('architect', { repo: 'acme/shop' });
    const again = await openProject('atlas', { name: 'shop' });
    expect(again.id).toBe(acme.id);
    expect(again.repo).toBe('acme/shop');
    expect(await allRows()).toHaveLength(1);
    expect(fs.existsSync(path.join(home, 'workspaces', 'shared', 'projects', 'shop'))).toBe(false);

    // Nobody has "notes": a new empty project, and by name it is the same one every time.
    const notes = await openProject('architect', { name: 'notes' });
    expect(notes.id).toBe('shared-notes');
    expect(notes.path).toBe(path.join(home, 'workspaces', 'shared', 'projects', 'notes'));
    expect((await openProject('atlas', { name: 'Notes' })).id).toBe('shared-notes');
    expect(await allRows()).toHaveLength(2);

    // Two projects called shop: the name alone is a question back, and no third one is made.
    await openProject('architect', { repo: 'beta/shop' });
    await expect(openProject('architect', { name: 'shop' })).rejects.toThrow(/More than one project is called "shop"/);
    expect(await allRows()).toHaveLength(3);
  });

  test('7. a row an older version merged (a repo and a folder on one row) is still the row that folder opens', async () => {
    await store.seed({ id: 'shared-shop', name: 'shop', repo: 'acme/shop', path: folders.one });

    const folder = await openProject('architect', { existingPath: folders.one });
    const repo = await openProject('architect', { repo: 'acme/shop' });

    expect(folder.id).toBe('shared-shop');
    expect(repo.id).toBe('shared-shop');
    expect(await allRows()).toHaveLength(1);
    expect(await row('shared-shop')).toMatchObject({ repo: 'acme/shop', path: folders.one });
    // Another folder with the same name is still its own project.
    expect((await openProject('architect', { existingPath: folders.two })).id).not.toBe('shared-shop');
  });

  test('one project with a name is still found by that name, as before', async () => {
    const acme = await openProject('architect', { repo: 'acme/shop' });
    expect((await getProjectByName('architect', 'Shop')).id).toBe(acme.id);
    expect((await getProjectByRepoOrPath('architect', 'shop')).id).toBe(acme.id);
    expect(await getProjectByName('architect', 'nothing-here')).toBeNull();
    expect(await getProjectByRepoOrPath('architect', 'nothing-here')).toBeNull();
  });

  test('"owner/name" never lands on another owner\'s repo with the same last part', async () => {
    await openProject('architect', { repo: 'beta/shop' });
    expect(await getProjectByName('architect', 'shop', { sameRepoAs: 'acme/shop' })).toBeNull();
    const folder = await openProject('architect', { existingPath: folders.one });
    expect((await getProjectByName('architect', 'shop', { sameRepoAs: 'acme/shop' })).id).toBe(folder.id);
  });
});

describe('the id a project gets', () => {
  test('is the same every time for the same place, and different for different places', async () => {
    const { distinctProjectId, repoSourceKey, folderSourceKey, plainProjectId } = await import('../server/workspaces/projectIdentity.js');
    expect(plainProjectId('My Shop')).toBe('shared-my-shop');
    expect(distinctProjectId('shop', repoSourceKey('beta/shop'))).toBe(distinctProjectId('shop', repoSourceKey('Beta/Shop.git')));
    expect(distinctProjectId('shop', repoSourceKey('beta/shop'))).not.toBe(distinctProjectId('shop', repoSourceKey('acme/shop')));
    expect(folderSourceKey('D:\\Repos\\Shop\\')).toBe(folderSourceKey('d:/repos/shop'));
    expect(folderSourceKey('/srv/Shop')).not.toBe(folderSourceKey('/srv/shop'));
    expect(distinctProjectId('shop', repoSourceKey('acme/shop'))).not.toBe(distinctProjectId('shop', folderSourceKey('/acme/shop')));
  });
});

describe('a project named on a board', () => {
  const shops = [
    { id: 'shared-shop', name: 'shop', repo: 'acme/shop', path: null, workspace_permission: 'work' },
    { id: 'shared-shop-0a1b2c3d', name: 'shop', repo: 'beta/shop', path: null, workspace_permission: 'work' },
  ];
  const board = (rows) => ({
    query: jest.fn(async (sql) => (String(sql).includes('JOIN projects p') ? { rows: rows.map((r) => ({ ...r })) } : { rows: [{ permission: 'work' }] })),
  });
  const ask = async (db, projectIdentifier) => {
    const { resolveAuthorizedWorkspaceProject } = await import('../server/workspaces/projectAccess.js');
    return resolveAuthorizedWorkspaceProject(db, { workspaceId: 'made-up-board', agentId: 'censai', projectIdentifier });
  };

  test('a bare name that fits two of the board\'s projects is asked back, with both named', async () => {
    await expect(ask(board(shops), 'shop')).rejects.toMatchObject({
      code: 'PROJECT_NAME_NEEDED',
      message: expect.stringMatching(/acme\/shop.*beta\/shop/),
    });
  });

  test('its id or its full repo picks that one, whichever row came first', async () => {
    expect((await ask(board(shops), 'shared-shop-0a1b2c3d')).repo).toBe('beta/shop');
    expect((await ask(board(shops), 'beta/shop')).id).toBe('shared-shop-0a1b2c3d');
    expect((await ask(board(shops), 'acme/shop')).id).toBe('shared-shop');
  });

  test('one project given twice (to read and to change) is one project, not a choice', async () => {
    const twice = [shops[0], { ...shops[0], workspace_permission: 'read' }];
    expect((await ask(board(twice), 'shop')).id).toBe('shared-shop');
    // No name: the board's first project, as before.
    expect((await ask(board(shops), null)).id).toBe('shared-shop');
  });
});

const onPostgres = realUrl ? describe : describe.skip;
onPostgres('docker/098-project-identity.sql on an install with data (real Postgres only)', () => {
  const rule = async () => (await store.pool.query(
    "SELECT conname FROM pg_constraint WHERE conrelid = 'projects'::regclass AND contype = 'u'"
  )).rows;
  const repoIndex = async () => (await store.pool.query(
    "SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'idx_projects_one_row_per_repo'"
  )).rows;

  test('runs twice, keeps every row and id, and lets two projects share a name', async () => {
    await store.reset({ migrate: false });
    await store.seed({ id: 'shared-shop', name: 'shop', repo: 'acme/shop' });
    await store.seed({ id: 'shared-notes', name: 'notes', path: folders.one });
    expect(await rule()).toHaveLength(1);
    const before = await allRows();

    await store.migrate();
    await store.migrate();

    expect(await allRows()).toEqual(before);
    expect(await rule()).toHaveLength(0);
    expect(await repoIndex()).toHaveLength(1);
    const beta = await openProject('architect', { repo: 'beta/shop' });
    expect(beta.id).not.toBe('shared-shop');
    expect((await row('shared-shop')).repo).toBe('acme/shop');
    // The database itself refuses a second row for a repo that is here.
    await expect(store.seed({ id: 'made-up-second', name: 'again', repo: 'Acme/Shop' })).rejects.toMatchObject({ code: '23505' });
  });

  test('an install that already has two rows for one repo keeps both', async () => {
    await store.reset({ migrate: false });
    await store.seed({ id: 'architect-shop', name: 'shop', repo: 'acme/shop', owner_agent_id: 'architect' });
    await store.seed({ id: 'atlas-shop', name: 'shop', repo: 'acme/shop', owner_agent_id: 'atlas' });

    await store.migrate();

    expect((await allRows()).map((r) => r.id)).toEqual(['architect-shop', 'atlas-shop']);
    expect(await repoIndex()).toHaveLength(0);
    // Both rows are the same project, so its name is not a choice.
    expect((await getProjectByName('atlas', 'shop')).id).toBe('atlas-shop');
  });

  test('before it has run, a second "shop" is refused in plain words and the first is untouched', async () => {
    await store.reset({ migrate: false });
    await openProject('architect', { repo: 'acme/shop' });
    await expect(openProject('architect', { repo: 'beta/shop' })).rejects.toThrow(/already open here from somewhere else/);
    expect((await row('shared-shop')).repo).toBe('acme/shop');
    expect(await allRows()).toHaveLength(1);
  });
});
