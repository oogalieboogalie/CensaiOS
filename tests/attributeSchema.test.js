import { jest } from '@jest/globals';

const mockPool = {
  query: jest.fn(),
};

jest.unstable_mockModule('../server/db.js', () => ({
  default: mockPool,
  createDbPool: () => mockPool,
}));

const { ensureAttributeSchema } = await import('../server/boot/attributeSchema.js');

describe('attribute schema bootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPool.query.mockResolvedValue({ rows: [] });
  });

  test('applies legacy attributes, unified registry, and mindset seed in order', async () => {
    await ensureAttributeSchema();

    expect(mockPool.query).toHaveBeenCalledTimes(4);
    expect(mockPool.query.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS attributes');
    expect(mockPool.query.mock.calls[1][0]).toContain('CREATE TABLE IF NOT EXISTS attribute_definitions');
    expect(mockPool.query.mock.calls[2][0]).toContain('mindset_strategic_foresight');
    expect(mockPool.query.mock.calls[2][0]).toContain("'mindset'");
    expect(mockPool.query.mock.calls[3][0]).toContain('workspace_agent_equipped_items');
  });
});
