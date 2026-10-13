import { jest } from '@jest/globals';
import {
  getAgentAttributes,
  saveAgentAttributes,
} from '../src/lib/api/attributes.js';
import {
  getAgentMindsets,
  saveAgentMindsets,
} from '../src/lib/api/mindsets.js';
import {
  applyFamilyEquipmentRecipe,
  getFamilyEquipmentRecipes,
} from '../src/lib/api/familyEquipment.js';
import {
  getAgentCapabilities,
  getAgentDebugTools,
  saveAgentCapabilities,
} from '../src/lib/api/capabilities.js';

function response(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: jest.fn().mockResolvedValue(body) };
}

describe('agent configuration client scope', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue(response({ attributes: [], mindsets: [], ok: true }));
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('carries the active workspace through reads and writes', async () => {
    await getAgentAttributes('atlas', 'workspace owner');
    await getAgentMindsets('atlas', 'workspace owner');
    await saveAgentAttributes('atlas', ['technical'], 'workspace-owner');
    await saveAgentMindsets('atlas', ['mindset_first'], 'workspace-owner');
    await getFamilyEquipmentRecipes('workspace owner');
    await applyFamilyEquipmentRecipe('artisan-family-v1', 'hash-1', 'workspace-owner');
    await getAgentCapabilities('atlas', 'workspace owner');
    await getAgentDebugTools('atlas', 'workspace owner');
    await saveAgentCapabilities('atlas', ['web-research'], 'workspace-owner');

    expect(fetch.mock.calls[0][0]).toBe('/api/agents/atlas/attributes?workspaceId=workspace%20owner');
    expect(fetch.mock.calls[1][0]).toBe('/api/agents/atlas/mindsets?workspaceId=workspace%20owner');
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({
      attributes: ['technical'], workspaceId: 'workspace-owner',
    });
    expect(JSON.parse(fetch.mock.calls[3][1].body)).toEqual({
      mindsets: ['mindset_first'], workspaceId: 'workspace-owner',
    });
    expect(fetch.mock.calls[4][0]).toBe('/api/family/equipment-recipes?workspaceId=workspace%20owner');
    expect(JSON.parse(fetch.mock.calls[5][1].body)).toEqual({
      workspaceId: 'workspace-owner', expectedHash: 'hash-1', confirmReplace: true,
    });
    expect(fetch.mock.calls[6][0]).toBe('/api/agents/atlas/capabilities?workspaceId=workspace%20owner');
    expect(fetch.mock.calls[7][0]).toBe('/api/agents/atlas/debug-tools?workspaceId=workspace%20owner');
    expect(JSON.parse(fetch.mock.calls[8][1].body)).toEqual({
      workspaceId: 'workspace-owner', modules: ['web-research'],
    });
  });

  test('fails before fetch when no workspace is active', async () => {
    await expect(getAgentAttributes('atlas', null)).rejects.toThrow(/open a workspace/i);
    await expect(getAgentMindsets('atlas', '')).rejects.toThrow(/open a workspace/i);
    await expect(getFamilyEquipmentRecipes(null)).rejects.toThrow(/open a workspace/i);
    await expect(getAgentCapabilities('atlas', null)).rejects.toThrow(/open a workspace/i);
    await expect(getAgentDebugTools('atlas', '')).rejects.toThrow(/open a workspace/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('preserves a scoped route denial instead of returning a false empty list', async () => {
    fetch.mockResolvedValueOnce(response({ error: 'Workspace access denied', code: 'FORBIDDEN' }, {
      ok: false, status: 403,
    }));
    await expect(getAgentAttributes('atlas', 'foreign')).rejects.toMatchObject({
      message: 'Workspace access denied', status: 403, code: 'FORBIDDEN',
    });
  });
});
