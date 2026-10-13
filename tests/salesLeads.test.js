import { jest } from '@jest/globals';

const mockPool = {
  query: jest.fn(),
  connect: jest.fn(),
  on: jest.fn(),
  end: jest.fn(),
  ended: false,
};

jest.unstable_mockModule('../server/db.js', () => ({
  default: mockPool,
  createDbPool: () => mockPool,
}));

const {
  normalizeLeadInput,
  saveLead,
  listLeads,
  setLeadStatus,
} = await import('../server/salesLeads/store.js');

const scope = { workspaceId: 'workspace-1', userId: 7 };

describe('sales lead store', () => {
  beforeEach(() => jest.clearAllMocks());

  test('normalizes input and requires a name', () => {
    let thrown = null;
    try {
      normalizeLeadInput({});
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toMatchObject({ code: 'LEAD_NAME_REQUIRED' });
    const lead = normalizeLeadInput({
      name: '  Jane Doe ',
      email: 'JANE@EXAMPLE.COM ',
      buying_signals: ['hiring', 'hiring', '', 42],
      icp_score: 9,
      facebook: 'https://facebook.com/jane',
    });
    expect(lead).toMatchObject({
      name: 'Jane Doe',
      email: 'JANE@EXAMPLE.COM',
      buying_signals: ['hiring'],
      icp_score: 1,
      facebook: 'https://facebook.com/jane',
      instagram: null,
      status: 'new',
    });
  });

  test('inserts a fresh lead with socials', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'lead-1' }] });

    const result = await saveLead({
      name: 'Bob Team', team: 'Bob Realty', city: 'Waterloo',
      phone: '555-0100', instagram: 'https://instagram.com/bob',
      buying_signals: ['open houses'], icp_score: 0.8,
      source_url: 'https://example.com/team',
    }, scope);

    expect(result).toEqual({ id: 'lead-1', deduped: false });
    expect(mockPool.query).toHaveBeenCalledTimes(2);
    expect(mockPool.query.mock.calls[1][0]).toContain('INSERT INTO sales_leads');
    expect(mockPool.query.mock.calls[1][1]).toEqual(expect.arrayContaining([
      'workspace-1', 7, 'Bob Team', 'Bob Realty', null, 'Waterloo',
    ]));
  });

  test('dedupes on email match and merges signals', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'lead-9' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'lead-9' }] });

    const result = await saveLead({ name: 'Jane', email: 'jane@example.com', buying_signals: ['hiring'] }, scope);

    expect(result).toEqual({ id: 'lead-9', deduped: true });
    expect(mockPool.query.mock.calls[1][0]).toContain('UPDATE sales_leads');
  });

  test('lists leads ordered by score with filters', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await listLeads({ ...scope, status: 'new', minScore: 0.6, limit: 10 });

    const [sql, params] = mockPool.query.mock.calls[0];
    expect(sql).toContain('ORDER BY icp_score DESC');
    expect(sql).toContain('status = $2');
    expect(params).toEqual(['workspace-1', 'new', 0.6]);
  });

  test('sets lead status workspace-scoped', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'lead-1' }] });

    await expect(setLeadStatus('lead-1', 'contacted', scope)).resolves.toBe(true);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('workspace_id = $2'),
      ['lead-1', 'workspace-1', 'contacted'],
    );
  });

  test('refuses unowned writes', async () => {
    await expect(saveLead({ name: 'X' })).rejects.toMatchObject({ code: 'AUTONOMY_OWNERSHIP_REQUIRED' });
    expect(mockPool.query).not.toHaveBeenCalled();
  });
});
