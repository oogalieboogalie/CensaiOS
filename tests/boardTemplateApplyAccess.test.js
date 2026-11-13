import { jest } from '@jest/globals';
import request from 'supertest';

// The owner and an editor (board admin) may lay a template onto the board.
// A plain member, a viewer, and a guest may not. The refusal is the same
// workspace answer every other board write already uses.
const WORKSPACE = 'workspace-board';
const ROLE = { 1: 'owner', 2: 'admin', 3: 'member', 4: 'viewer' };

jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));

const query = jest.fn(async (sql, params = []) => {
  const text = String(sql);
  // No board id: the server uses the caller's own board. The role comes back with it.
  if (text.includes('workspace_client_state')) {
    const role = ROLE[Number(params[0])];
    return { rows: role ? [{ id: WORKSPACE, name: 'Board', tenant_id: null, role }] : [] };
  }
  if (text.includes('FROM workspaces WHERE id')) {
    return { rows: [{ id: params[0], tenant_id: null }] };
  }
  if (text.includes('workspace_members')) {
    const role = ROLE[Number(params[1])];
    return { rows: role && params[0] === WORKSPACE ? [{ id: WORKSPACE, name: 'Board', role }] : [] };
  }
  throw new Error(`Unexpected query: ${text}`);
});
jest.unstable_mockModule('../server/db.js', () => ({
  default: { query, on: jest.fn(), end: jest.fn() },
}));

const applyBoardTemplate = jest.fn(async (id) => ({
  templateId: id, name: 'Developer', windows: [], groups: [], agents: [],
}));
jest.unstable_mockModule('../server/templates/index.js', () => ({
  BOARD_TEMPLATES: [{ id: 'developer', name: 'Developer' }],
  applyBoardTemplate,
}));
jest.unstable_mockModule('../server/realEstate/listingWriter.js', () => ({
  draftListing: jest.fn(),
}));

const { boardTemplatesRouter } = await import('../server/routes/agents/boardTemplates.js');

async function buildApp() {
  const express = (await import('express')).default;
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    const userId = Number(req.get('x-user-id'));
    req.session = {};
    if (Number.isInteger(userId) && userId > 0) req.session.userId = userId;
    const guestRole = req.get('x-guest-role');
    if (guestRole) req.session.guest = { role: guestRole, linkId: 'link-1', guestId: 'guest-1' };
    next();
  });
  instance.use('/api', boardTemplatesRouter);
  return instance;
}

function applyAs(server, { userId, guest } = {}) {
  const req = request(server).post('/api/board-templates/developer/apply').send({ workspaceId: WORKSPACE });
  if (userId) req.set('x-user-id', String(userId));
  if (guest) req.set('x-guest-role', guest);
  return req;
}

describe('who may apply a board template', () => {
  let server;

  beforeAll(async () => {
    server = await buildApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('the owner can apply a template', async () => {
    const response = await applyAs(server, { userId: 1 });
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.board.templateId).toBe('developer');
    expect(applyBoardTemplate).toHaveBeenCalledWith('developer', expect.objectContaining({
      scope: { userId: 1, workspaceId: WORKSPACE, role: 'owner' },
    }));
  });

  test('an editor can apply a template', async () => {
    const response = await applyAs(server, { userId: 2 });
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(applyBoardTemplate).toHaveBeenCalledWith('developer', expect.objectContaining({
      scope: { userId: 2, workspaceId: WORKSPACE, role: 'admin' },
    }));
  });

  test('a viewer cannot apply a template, even with an edit link', async () => {
    const response = await applyAs(server, { userId: 4, guest: 'edit' });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Workspace role does not allow this operation');
    expect(applyBoardTemplate).not.toHaveBeenCalled();
  });

  test('a plain member cannot apply a template', async () => {
    const response = await applyAs(server, { userId: 3 });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Workspace role does not allow this operation');
    expect(applyBoardTemplate).not.toHaveBeenCalled();
  });

  test('a guest cannot apply a template', async () => {
    const response = await applyAs(server, { guest: 'edit' });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Workspace access denied');
    expect(applyBoardTemplate).not.toHaveBeenCalled();
  });

  test.each([
    ['a viewer', 4],
    ['a plain member', 3],
  ])('%s cannot apply a template when the board id is left out', async (_label, userId) => {
    const response = await request(server)
      .post('/api/board-templates/developer/apply')
      .set('x-user-id', String(userId))
      .send({ workspaceId: null });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Workspace role does not allow this operation');
    expect(applyBoardTemplate).not.toHaveBeenCalled();
  });

  test.each([
    ['the owner', 1, 'owner'],
    ['an editor', 2, 'admin'],
  ])('%s can apply a template when the board id is left out', async (_label, userId, role) => {
    const response = await request(server)
      .post('/api/board-templates/developer/apply')
      .set('x-user-id', String(userId))
      .send({ workspaceId: null });
    expect(response.status).toBe(200);
    expect(applyBoardTemplate).toHaveBeenCalledWith('developer', expect.objectContaining({
      scope: { userId, workspaceId: WORKSPACE, role },
    }));
  });

  test('a viewer can still see the template list', async () => {
    const response = await request(server).get('/api/board-templates').set('x-user-id', '4');
    expect(response.status).toBe(200);
    expect(response.body.templates.map((template) => template.id)).toContain('developer');
  });
});
