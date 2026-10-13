import { jest } from '@jest/globals';

const inspectEquipmentTenancySchema = jest.fn();
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn() } }));
jest.unstable_mockModule('../server/attributes/tenancySchema.js', () => ({
  inspectEquipmentTenancySchema,
}));

const { getEquipmentOwnershipSummary } = await import('../server/attributes/tenancyStatus.js');

describe('equipment ownership status', () => {
  beforeEach(() => jest.clearAllMocks());

  test('separates scoped rows from both legacy quarantine tables', async () => {
    inspectEquipmentTenancySchema.mockResolvedValue({ ready: true });
    const db = { query: jest.fn().mockResolvedValue({ rows: [{
      legacy_unified: 2,
      legacy_attributes: 3,
      scoped: 4,
      scoped_workspaces: 2,
      scoped_agents: 3,
    }] }) };
    await expect(getEquipmentOwnershipSummary(db)).resolves.toEqual({
      ready: true,
      legacyQuarantinedCount: 5,
      legacyUnifiedCount: 2,
      legacyAttributeCount: 3,
      scopedCount: 4,
      scopedWorkspaceCount: 2,
      scopedAgentCount: 3,
    });
  });

  test('fails readiness without querying counts when the scoped schema is absent', async () => {
    inspectEquipmentTenancySchema.mockResolvedValue({ ready: false, present: false });
    const db = { query: jest.fn() };
    const result = await getEquipmentOwnershipSummary(db);
    expect(result).toMatchObject({ ready: false, scopedCount: null, legacyQuarantinedCount: null });
    expect(db.query).not.toHaveBeenCalled();
  });
});
