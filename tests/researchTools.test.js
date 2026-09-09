import { jest } from '@jest/globals';

const saveLead = jest.fn();
const listLeads = jest.fn().mockResolvedValue([]);
const setLeadStatus = jest.fn();

jest.unstable_mockModule('../server/salesLeads/store.js', () => ({
  saveLead,
  listLeads,
  setLeadStatus,
}));

const { handleResearchTool } = await import('../server/tools/handlers/research.js');
const { TOOL_DEFINITIONS } = await import('../server/tools/definitions.js');
const { TOOL_REGISTRY } = await import('../server/tools/handlers/index.js');

const ctx = { workspaceId: 'workspace-1', userId: 7 };

describe('research tools (Search & Rescue)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('lead definitions are registered and handled', () => {
    for (const name of ['lead_save', 'lead_list', 'lead_status', 'web_extract']) {
      expect(TOOL_DEFINITIONS.some((t) => t.function.name === name)).toBe(true);
      expect(TOOL_REGISTRY[name]).toBeDefined();
    }
  });

  test('lead_save stores and reports dedupe', async () => {
    saveLead.mockResolvedValueOnce({ id: 'l-1', deduped: false });
    await expect(handleResearchTool('censai', 'lead_save', { name: 'Jane' }, ctx))
      .resolves.toContain('l-1');
    saveLead.mockResolvedValueOnce({ id: 'l-1', deduped: true });
    await expect(handleResearchTool('censai', 'lead_save', { name: 'Jane' }, ctx))
      .resolves.toMatch(/already in store/i);
  });

  test('lead_list formats the queue by score', async () => {
    listLeads.mockResolvedValueOnce([{
      id: 'l-1', name: 'Jane Doe', team: 'Doe Realty', brokerage: null,
      city: 'Cedar Falls', phone: '555-0100', email: null, website: null,
      facebook: 'https://facebook.com/jane', instagram: null, linkedin: null,
      icp_score: 0.85,
    }]);

    const result = await handleResearchTool('censai', 'lead_list', {}, ctx);

    expect(result).toContain('Jane Doe (Doe Realty)');
    expect(result).toContain('Cedar Falls');
    expect(result).toContain('[fb]');
    expect(result).toContain('<l-1>');
  });

  test('lead_list is honest about an empty store', async () => {
    await expect(handleResearchTool('censai', 'lead_list', {}, ctx))
      .resolves.toMatch(/no leads/i);
  });

  test('lead_status reports misses workspace-scoped', async () => {
    setLeadStatus.mockResolvedValueOnce(true);
    await expect(handleResearchTool('censai', 'lead_status', { lead_id: 'l-1', status: 'contacted' }, ctx))
      .resolves.toContain('contacted');
    setLeadStatus.mockResolvedValueOnce(false);
    await expect(handleResearchTool('censai', 'lead_status', { lead_id: 'nope', status: 'dead' }, ctx))
      .resolves.toMatch(/not found/);
  });
});
