import { jest } from '@jest/globals';
import request from 'supertest';

const sendAgentMessage = jest.fn().mockResolvedValue('message-1');
const memoryStubs = {
  storeMemory: jest.fn(),
  writeJournal: jest.fn(),
  addTriple: jest.fn(),
  addNugget: jest.fn(),
  addAssociation: jest.fn(),
  updateConsciousness: jest.fn(),
  sendAgentMessage,
  recallMemories: jest.fn(),
  readJournals: jest.fn(),
  queryGraph: jest.fn(),
  getAgentMessages: jest.fn(),
  markMessageRead: jest.fn(),
  getAssociations: jest.fn(),
};

jest.unstable_mockModule('../server/memory.js', () => memoryStubs);
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn() } }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({
  resolveWorkspaceContext: jest.fn().mockResolvedValue({ id: 'workspace-1' }),
}));

const { default: express } = await import('express');
const { communicationRouter } = await import('../server/routes/agents/communication.js');
const { handleMemoryTool } = await import('../server/tools/handlers/memory.js');

const app = express();
app.use(express.json());
app.use('/api', communicationRouter);

beforeEach(() => jest.clearAllMocks());

test('public message creation rejects caller-supplied agent identity', async () => {
  const response = await request(app).post('/api/messages').send({
    fromAgent: 'atlas', toAgent: 'censai', content: 'spoofed',
  });

  expect(response.status).toBe(409);
  expect(response.body.code).toBe('AGENT_MESSAGE_SENDER_UNVERIFIED');
  expect(sendAgentMessage).not.toHaveBeenCalled();
});

test.each([
  ['guardian', 'atlas'],
  ['atlas', 'guardian'],
])('agent tools reject a non-family sender or recipient (%s to %s)', async (sender, recipient) => {
  await expect(handleMemoryTool(
    sender,
    'message_to',
    { agent: recipient, content: 'blocked' },
    { workspaceId: 'workspace-1', userId: 7 },
  )).rejects.toMatchObject({ code: 'FAMILY_AGENT_NOT_FOUND', statusCode: 404 });
  expect(sendAgentMessage).not.toHaveBeenCalled();
});

test('agent tools establish a canonical sender inside the runtime', async () => {
  await handleMemoryTool(
    'atlas',
    'message_to',
    { agent: 'censai', content: 'verified' },
    { workspaceId: 'workspace-1', userId: 7 },
  );

  expect(sendAgentMessage).toHaveBeenCalledWith(
    'atlas',
    'censai',
    'verified',
    expect.objectContaining({
      workspaceId: 'workspace-1', userId: 7, messageType: 'agent-to-agent',
    }),
  );
});
