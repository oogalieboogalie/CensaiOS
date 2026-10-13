import { getRequestContext, getRuntimeMode } from '../server/middleware/runtimeMode.js';

describe('getRequestContext', () => {
  test('aggregates tenantId, workspaceId, actor, principal, runtimeMode from req', () => {
    const req = {
      session: { userId: 'u-1', userRole: 'admin' },
      workspaceContext: { tenantId: 'acme', workspaceId: 'ws-1' },
    };

    const ctx = getRequestContext(req);

    expect(ctx).toEqual({
      tenantId: 'acme',
      workspaceId: 'ws-1',
      actor: 'u-1',
      principal: 'admin',
      runtimeMode: getRuntimeMode(),
    });
  });

  test('returns nulls when the request has no session or workspaceContext', () => {
    const req = {};
    const ctx = getRequestContext(req);

    expect(ctx.tenantId).toBeNull();
    expect(ctx.workspaceId).toBeNull();
    expect(ctx.actor).toBeNull();
    expect(ctx.principal).toBeNull();
    expect(ctx.runtimeMode).toBe(getRuntimeMode());
  });

  test('falls back to context.id when workspaceId is not explicitly set', () => {
    const req = {
      session: { userId: 7, userRole: 'user' },
      workspaceContext: { id: 'ws-fallback', tenantId: 'beta' },
    };

    const ctx = getRequestContext(req);

    expect(ctx.workspaceId).toBe('ws-fallback');
    expect(ctx.tenantId).toBe('beta');
  });

  test('tolerates a null req and returns nulls', () => {
    const ctx = getRequestContext(null);

    expect(ctx.tenantId).toBeNull();
    expect(ctx.workspaceId).toBeNull();
    expect(ctx.actor).toBeNull();
    expect(ctx.principal).toBeNull();
    expect(ctx.runtimeMode).toBe(getRuntimeMode());
  });
});