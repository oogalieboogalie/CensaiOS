import { jest } from '@jest/globals';
import request from 'supertest';

// Mock the database pool
const mockClient = {
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
};

const mockPool = {
  query: jest.fn(),
  connect: jest.fn().mockResolvedValue(mockClient),
  on: jest.fn(),
  end: jest.fn(),
};

jest.unstable_mockModule('../server/db.js', () => ({
  default: mockPool,
  createDbPool: () => mockPool,
}));

// Mock DB readiness
jest.unstable_mockModule('../server/dbState.js', () => ({
  dbReady: () => true,
  setDbReady: jest.fn(),
}));

const mockRequireWorkspaceMember = jest.fn().mockResolvedValue({ id: 'workspace-1', role: 'owner' });
jest.unstable_mockModule('../server/workspaces/context.js', () => ({
  requireWorkspaceMember: mockRequireWorkspaceMember,
}));

// Mock basic memory queries from individual sub-modules
jest.unstable_mockModule('../server/memory/core/agents.js', () => ({
  getAgent: jest.fn().mockResolvedValue({ id: 'censai', name: 'Censai', role: 'Editorial · research' }),
  getAgents: jest.fn().mockResolvedValue([]),
  getAgentsByIds: jest.fn().mockResolvedValue([]),
  upsertAgent: jest.fn(async (a) => a),
}));

jest.unstable_mockModule('../server/memory/subagents.js', () => ({
  getSubAgentById: jest.fn().mockResolvedValue(null),
  createSubAgent: jest.fn(),
  getSubAgents: jest.fn().mockResolvedValue([]),
  getAllSubAgents: jest.fn().mockResolvedValue([]),
  updateSubAgent: jest.fn(),
  deleteSubAgent: jest.fn(),
  scratchpadWrite: jest.fn(),
  scratchpadRead: jest.fn(),
  scratchpadClear: jest.fn(),
  SUB_AGENT_PRESETS: {},
}));

// Mock tools to avoid loading execution loops
jest.unstable_mockModule('../server/tools.js', () => ({
  listToolCatalog: jest.fn(() => ({ tools: [], categories: [] })),
  filterToolsForAgent: jest.fn().mockResolvedValue([]),
}));

// Import compiler and router after mocks are registered
const { compilePromptTemplate } = await import('../server/memory/promptCompiler.js');
const { coreRouter } = await import('../server/routes/agents/core.js');
const { attributesRouter } = await import('../server/routes/agents/attributes.js');

describe('Persona Attributes Compiler & API', () => {
  let app;

  beforeAll(async () => {
    const express = (await import('express')).default;
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.session = { userId: 1 };
      next();
    });
    app.use('/api', coreRouter);
    app.use('/api', attributesRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool.query.mockReset();
    mockClient.query.mockReset();
  });

  describe('Prompt Compilation Logic', () => {
    test('compiles template placeholders with equipped attributes', () => {
      const template = "You are {{ a very $meticulous and $friendly }} design lead.";
      const equipped = {
        meticulous: "detail-oriented",
        friendly: "warm",
      };

      const result = compilePromptTemplate(template, equipped);
      expect(result).toBe("You are a very detail-oriented and warm design lead.");
    });

    test('collapses block completely when no attributes inside are equipped', () => {
      const template = "You are {{ a very $meticulous and $friendly }} design lead.";
      const equipped = {};

      const result = compilePromptTemplate(template, equipped);
      expect(result).toBe("You are design lead.");
    });

    test('joins only equipped attributes when some are missing', () => {
      const template = "You are {{ a very $meticulous and $friendly }} design lead.";
      const equipped = {
        meticulous: "detail-oriented",
      };

      const result = compilePromptTemplate(template, equipped);
      expect(result).toBe("You are a very detail-oriented design lead.");
    });

    test('performs natural list joining for three or more attributes', () => {
      const template = "You are {{ a very $meticulous, $friendly, and $creative }} designer.";
      const equipped = {
        meticulous: "detail-oriented",
        friendly: "warm",
        creative: "inventive",
      };

      const result = compilePromptTemplate(template, equipped);
      expect(result).toBe("You are a very detail-oriented, warm, and inventive designer.");
    });
  });

  describe('Attributes API Endpoints', () => {
    test('GET /api/attributes returns seeded attributes', async () => {
      const mockAttrs = [
        { id: 'meticulous', name: 'Meticulous', description: 'desc', value: 'val', type: 'attribute' }
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockAttrs });

      const response = await request(app).get('/api/attributes');
      expect(response.status).toBe(200);
      expect(response.body.attributes).toEqual([
        {
          id: 'meticulous',
          name: 'Meticulous',
          description: 'desc',
          value: 'val',
          default_value: 'val',
          type: 'attribute',
          category: null,
          validation: {},
        }
      ]);
      expect(mockPool.query.mock.calls[0][0]).toContain('FROM attribute_definitions');
      expect(mockPool.query.mock.calls[0][0]).toContain("type = 'attribute'");
    });

    test('GET /api/attributes remains attribute-only when includeMindsets is requested', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'meticulous', name: 'Meticulous', description: 'desc', value: 'val', type: 'attribute' },
        ]
      });

      const response = await request(app).get('/api/attributes?includeMindsets=true');
      expect(response.status).toBe(200);
      expect(response.body.attributes.map(attr => attr.id)).toEqual(['meticulous']);
      expect(mockPool.query.mock.calls[0][0]).toContain("type = 'attribute'");
    });

    test('GET /api/attributes falls back to legacy attributes when registry is absent', async () => {
      const missingRegistry = Object.assign(new Error('relation "attribute_definitions" does not exist'), { code: '42P01' });
      mockPool.query
        .mockRejectedValueOnce(missingRegistry)
        .mockResolvedValueOnce({
          rows: [{ id: 'meticulous', name: 'Meticulous', description: 'desc', value: 'val' }]
        });

      const response = await request(app).get('/api/attributes');
      expect(response.status).toBe(200);
      expect(response.body.attributes[0]).toEqual(expect.objectContaining({
        id: 'meticulous',
        value: 'val',
        type: 'attribute',
      }));
      expect(mockPool.query.mock.calls[1][0]).toContain('FROM attributes');
    });

    test('GET /api/agents/:id/attributes returns equipped attribute IDs', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'meticulous' }, { id: 'friendly' }]
      });

      const response = await request(app).get('/api/agents/censai/attributes?workspaceId=workspace-1');
      expect(response.status).toBe(200);
      expect(response.body.attributes).toEqual(['meticulous', 'friendly']);
      expect(response.body.workspaceId).toBe('workspace-1');
      expect(mockPool.query.mock.calls[0][0]).toContain('workspace_agent_equipped_items');
      expect(mockPool.query.mock.calls[0][0]).toContain('d.type = $3');
      expect(mockPool.query.mock.calls[0][1]).toEqual(['censai', 'workspace-1', 'attribute']);
    });

    test('PUT /api/agents/:id/attributes updates agent attributes in a transaction', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // advisory lock
        .mockResolvedValueOnce({ rows: [{ id: 'meticulous' }] }) // validate
        .mockResolvedValueOnce({}) // DELETE
        .mockResolvedValueOnce({}) // INSERT
        .mockResolvedValueOnce({}); // COMMIT

      const response = await request(app)
        .put('/api/agents/censai/attributes')
        .send({ attributes: ['meticulous'], workspaceId: 'workspace-1', userId: 999 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true, workspaceId: 'workspace-1' });
      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockClient.query.mock.calls[1][0]).toContain('pg_advisory_xact_lock');
      expect(mockClient.query.mock.calls[1][1]).toEqual(['["workspace-1","censai","attribute"]']);
      expect(mockClient.query.mock.calls[2][0]).toContain('SELECT id,type,validation FROM attribute_definitions');
      expect(mockClient.query.mock.calls[3][0]).toContain('DELETE FROM workspace_agent_equipped_items');
      expect(mockClient.query.mock.calls[4][0]).toContain('INSERT INTO workspace_agent_equipped_items');
      expect(mockClient.query.mock.calls[4][1]).toEqual(['workspace-1', 'censai', 1, ['meticulous']]);
      expect(mockClient.query).toHaveBeenNthCalledWith(6, 'COMMIT');
    });

    test('POST /api/agents/:id/compile-prompt-preview returns compiled template preview', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'meticulous', value: 'detail-oriented' }]
      });

      const response = await request(app)
        .post('/api/agents/censai/compile-prompt-preview')
        .send({
          template: "You are {{ very $meticulous }}.",
          attributes: ['meticulous'],
          workspaceId: 'workspace-1',
        });

      expect(response.status).toBe(200);
      expect(response.body.compiled).toBe("You are very detail-oriented.");
      expect(response.body.workspaceId).toBe('workspace-1');
      expect(mockPool.query.mock.calls[0][0]).toContain('FROM attribute_definitions');
    });
  });
});
