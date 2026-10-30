// Everything that changes this computer itself (Docker, dev servers and folder
// mounts, git, Windows tasks, repo and project files, Legion's host browser,
// the terminal) is for the computer's owner only. Teammates can still look,
// except at Docker (tests/dockerReadsOwnerOnly.test.js).
//
// Each case runs the REAL guards in front of a route (the mount's middleware
// from ROUTE_MOUNTS, or the route's own middleware in its router), then a
// stand-in that says "reached" instead of touching Docker, git or the disk.
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import pool from '../server/db.js';
import { ROUTE_MOUNTS } from '../server/boot/routeMap.js';
import { OWNER_ONLY_MESSAGE } from '../server/security/systemAdmin.js';
import { containersRouter } from '../server/routes/containers.js';
import { browserRouter } from '../server/routes/files/browser.js';
import { mkdirRouter } from '../server/routes/files/mkdir.js';
import { projectsRouter } from '../server/routes/projects/index.js';
import { windowImportRouter } from '../server/routes/windowImport.js';
import { windowSdkRouter } from '../server/routes/windowSdk.js';
import { overseerRouter } from '../server/routes/overseer.js';

// Pretend people, never real ones: Pat owns this computer; Mo can edit Pat's
// board; Sol only works on boards Sol made.
const ROLES = { 1: 'admin', 2: 'user', 3: 'user' };
const PAT = 1;
const TEAMMATES = [2, 3];

beforeAll(() => {
  pool.query = jest.fn(async (_sql, [id]) => ({ rows: ROLES[id] ? [{ role: ROLES[id] }] : [] }));
});

const reached = (_req, res) => res.json({ reached: true });

function appWith(handlers, method, path, userId) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.session = { userId }; next(); });
  app[method](path, ...handlers, reached);
  return app;
}

function mountGuards(mountPath) {
  const entry = ROUTE_MOUNTS.find((e) => e.path === mountPath);
  if (!entry) throw new Error(`no mount ${mountPath}`);
  return entry.middleware || [];
}

function routeGuards(router, method, path) {
  const layer = router.stack.find((l) => l.route?.path === path && l.route.methods[method]);
  if (!layer) throw new Error(`no route ${method} ${path}`);
  return layer.route.stack.slice(0, -1).map((item) => item.handle);
}

// [label, method, url, guards]
const MOUNTED = [
  ['Docker run a command in a container', 'post', '/api/docker/containers/web/exec', '/api/docker'],
  ['Docker stop a container', 'post', '/api/docker/containers/web/stop', '/api/docker'],
  ['Docker delete a container', 'delete', '/api/docker/containers/web', '/api/docker'],
  ['Docker pull an image', 'post', '/api/docker/images/pull', '/api/docker'],
  ['Docker compose up', 'post', '/api/docker/compose/app/up', '/api/docker'],
  ['Docker prune', 'post', '/api/docker/prune/images', '/api/docker'],
  ['start a dev server (mounts a folder)', 'post', '/api/dev-servers', '/api/dev-servers'],
  ['stop a dev server', 'delete', '/api/dev-servers/censai-dev-x', '/api/dev-servers'],
  ['project git new project', 'post', '/api/project-git/new', '/api/project-git'],
  ['project git save a version', 'post', '/api/project-git/save', '/api/project-git'],
  ['project git push to GitHub', 'post', '/api/project-git/send', '/api/project-git'],
  ['run a Windows task', 'post', '/api/automation/backup/run', '/api/automation'],
  ['turn a Windows task on', 'post', '/api/automation/backup/enable', '/api/automation'],
  ['start a Legion run (host browser)', 'post', '/api/legion/runs', '/api/legion'],
  ['run a Vex orchestrator', 'post', '/api/vex/run', '/api/vex'],
  ['change an idea card in the repo', 'post', '/api/ideas/disposition', '/api/ideas'],
].map(([label, method, url, mount]) => [label, method, url, mountGuards(mount)]);

const IN_ROUTER = [
  ['restart a container', 'post', '/containers/:id/restart', containersRouter],
  ['remove a container', 'delete', '/containers/:id', containersRouter],
  ['save a file', 'put', '/files/content', browserRouter],
  ['make a folder', 'post', '/files/mkdir', mkdirRouter],
  ['switch the current project folder', 'put', '/current-project', projectsRouter],
  ['open any folder as a project', 'post', '/projects/open', projectsRouter],
  ['write a project idea file', 'post', '/project-ideas', projectsRouter],
  ['write a project handoff file', 'post', '/project-handoffs', projectsRouter],
  ['run window sync', 'post', '/sync', windowImportRouter],
  ['scaffold a window', 'post', '/window-sdk/scaffold', windowSdkRouter],
  ['make a new window', 'post', '/window-sdk/new', windowSdkRouter],
  ['run window validate', 'post', '/window-sdk/validate', windowSdkRouter],
  ['start the overseer (can merge PRs)', 'post', '/overseer/start', overseerRouter],
  ['stop the overseer', 'post', '/overseer/stop', overseerRouter],
  ['run an overseer audit', 'post', '/overseer/run', overseerRouter],
].map(([label, method, path, router]) => [label, method, path.replace(':id', 'web'), routeGuards(router, method, path)]);

describe.each([...MOUNTED, ...IN_ROUTER])('%s', (_label, method, url, guards) => {
  test.each(TEAMMATES)('teammate %p is refused with a plain message', async (id) => {
    const res = await request(appWith(guards, method, url, id))[method](url).send({});
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: OWNER_ONLY_MESSAGE, code: 'computer_owner_only' });
    expect(res.body.reached).toBeUndefined();
  });

  test("the computer's owner gets through", async () => {
    const res = await request(appWith(guards, method, url, PAT))[method](url).send({});
    expect(res.status).toBe(200);
    expect(res.body.reached).toBe(true);
  });

  test('someone not signed in is refused', async () => {
    const res = await request(appWith(guards, method, url, undefined))[method](url).send({});
    expect(res.status).toBe(401);
  });
});

describe('looking stays open to teammates', () => {
  test.each([
    ['/api/dev-servers', '/api/dev-servers'],
    ['/api/project-git/status', '/api/project-git'],
    ['/api/automation/status', '/api/automation'],
    ['/api/legion/runs', '/api/legion'],
  ])('GET %s', async (url, mount) => {
    for (const id of [PAT, ...TEAMMATES]) {
      const res = await request(appWith(mountGuards(mount), 'get', url, id)).get(url);
      expect(res.status).toBe(200);
    }
  });

  test('reading a file has no owner check', () => {
    expect(routeGuards(browserRouter, 'get', '/files/content').map((h) => h.name))
      .not.toContain('requireSystemAdmin');
  });

  test('a folder listed again (Files catching up) is guarded and answered exactly as when opened', () => {
    const handlers = (path) => [...routeGuards(browserRouter, 'get', path),
      browserRouter.stack.find((l) => l.route?.path === path).route.stack.at(-1).handle];
    const [again, opened] = [handlers('/files/relist'), handlers('/files/browse')];
    expect(again).toHaveLength(opened.length);
    again.forEach((handle, i) => expect(handle).toBe(opened[i]));
    expect(again.map((h) => h.name)).toContain('requireLocalFilesystem');
  });
});

describe('board content stays with the board', () => {
  test('no broad /api mount (boards, windows, docs, sheets, chat) carries the owner check', () => {
    const owner = mountGuards('/api/dev-servers').find((h) => h.name === 'requireSystemAdminForChanges');
    expect(owner).toBeDefined();
    for (const entry of ROUTE_MOUNTS.filter((e) => e.path === '/api' || e.path === '/api/sheets' || e.path === '/api/inbox')) {
      expect(entry.middleware || []).not.toContain(owner);
    }
  });
});
