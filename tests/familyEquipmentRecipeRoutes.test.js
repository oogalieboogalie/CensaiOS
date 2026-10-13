import { jest } from '@jest/globals';
import request from 'supertest';

const pool = { query: jest.fn(), connect: jest.fn() };
const listFamilyEquipmentRecipes = jest.fn();
const applyFamilyEquipmentRecipe = jest.fn();
const requireWorkspaceMember = jest.fn(async (_db, { userId, workspaceId, roles }) => {
  if (workspaceId === 'workspace-owned' && userId === 2) {
    throw Object.assign(new Error('Workspace access denied'), { statusCode: 403 });
  }
  const role = userId === 3 ? 'viewer' : 'owner';
  if (roles && !roles.includes(role)) {
    throw Object.assign(new Error('Workspace role does not allow this operation'), { statusCode: 403 });
  }
  return { id: workspaceId, role };
});

class FamilyRecipeError extends Error {}

jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));
jest.unstable_mockModule('../server/attributes/familyRecipes.js', () => ({
  FamilyRecipeError,
  listFamilyEquipmentRecipes,
  applyFamilyEquipmentRecipe,
}));

const { default: express } = await import('express');
const { familyEquipmentRecipesRouter } = await import('../server/routes/agents/familyEquipmentRecipes.js');

function app(userId = 1) {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    req.session = userId ? { userId } : {};
    next();
  });
  instance.use('/api', familyEquipmentRecipesRouter);
  return instance;
}

describe('family equipment recipe routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listFamilyEquipmentRecipes.mockResolvedValue([{ id: 'artisan-family-v1', hash: 'hash-1' }]);
    applyFamilyEquipmentRecipe.mockResolvedValue({ changed: true, eventId: 'event-1', recipe: { applied: true } });
  });

  test('allows workspace reads and derives apply ownership from the signed session', async () => {
    const read = await request(app()).get('/api/family/equipment-recipes?workspaceId=workspace-owned');
    const write = await request(app()).post('/api/family/equipment-recipes/artisan-family-v1/apply').send({
      workspaceId: 'workspace-owned',
      workspace_id: 'workspace-owned',
      userId: 999,
      actor: { kind: 'system', id: 'attacker' },
      expectedHash: 'hash-1',
      confirmReplace: true,
    });

    expect(read.status).toBe(200);
    expect(read.body.workspaceId).toBe('workspace-owned');
    expect(listFamilyEquipmentRecipes).toHaveBeenCalledWith(pool, 'workspace-owned');
    expect(write.status).toBe(200);
    expect(applyFamilyEquipmentRecipe).toHaveBeenCalledWith(pool, {
      workspaceId: 'workspace-owned',
      userId: 1,
      recipeId: 'artisan-family-v1',
      expectedHash: 'hash-1',
      confirmReplace: true,
    });
  });

  test('allows viewer inspection but denies viewer and outsider writes before mutation', async () => {
    const viewerRead = await request(app(3)).get('/api/family/equipment-recipes?workspaceId=workspace-viewer');
    const viewerWrite = await request(app(3)).post('/api/family/equipment-recipes/artisan-family-v1/apply')
      .send({ workspaceId: 'workspace-viewer', expectedHash: 'hash-1', confirmReplace: true });
    const outsiderWrite = await request(app(2)).post('/api/family/equipment-recipes/artisan-family-v1/apply')
      .send({ workspaceId: 'workspace-owned', expectedHash: 'hash-1', confirmReplace: true });

    expect(viewerRead.status).toBe(200);
    expect(viewerWrite.status).toBe(403);
    expect(outsiderWrite.status).toBe(403);
    expect(applyFamilyEquipmentRecipe).not.toHaveBeenCalled();
  });

  test('rejects unauthenticated, missing, and conflicting scopes', async () => {
    const unauthenticated = await request(app(0)).get('/api/family/equipment-recipes?workspaceId=workspace-owned');
    const missing = await request(app()).get('/api/family/equipment-recipes');
    const conflict = await request(app()).post('/api/family/equipment-recipes/artisan-family-v1/apply?workspaceId=a')
      .send({ workspaceId: 'b', expectedHash: 'hash-1', confirmReplace: true });

    expect(unauthenticated.status).toBe(401);
    expect(missing.status).toBe(400);
    expect(conflict.status).toBe(400);
    expect(requireWorkspaceMember).not.toHaveBeenCalledWith(pool, expect.objectContaining({ workspaceId: 'b' }));
  });

  test('preserves safe contract errors and hides internal failures', async () => {
    const stale = Object.assign(new FamilyRecipeError('Review again.'), {
      statusCode: 409,
      code: 'FAMILY_RECIPE_STALE',
    });
    applyFamilyEquipmentRecipe.mockRejectedValueOnce(stale);
    const staleResponse = await request(app()).post('/api/family/equipment-recipes/artisan-family-v1/apply')
      .send({ workspaceId: 'workspace-owned', expectedHash: 'old', confirmReplace: true });
    applyFamilyEquipmentRecipe.mockRejectedValueOnce(new Error('password=never-return SELECT private'));
    const failed = await request(app()).post('/api/family/equipment-recipes/artisan-family-v1/apply')
      .send({ workspaceId: 'workspace-owned', expectedHash: 'hash-1', confirmReplace: true });

    expect(staleResponse.body).toEqual({ error: 'Review again.', code: 'FAMILY_RECIPE_STALE' });
    expect(failed.status).toBe(500);
    expect(failed.body).toEqual({ error: 'Family equipment is temporarily unavailable.' });
  });
});
