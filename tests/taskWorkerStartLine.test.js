import { jest } from '@jest/globals';

const lines = [];
const write = (level) => (msg, meta) => lines.push({ level, msg, meta });
jest.unstable_mockModule('../server/task-worker/shared.js', () => ({
  log: { info: write('info'), warn: write('warn'), error: write('error'), debug: () => {}, startTimer: () => () => 5 },
  TASK_SUBMISSION_PREVIEW_CHARS: 1200,
  MAX_ROUNDS: 30,
  TASK_TIMEOUT_MS: 120000,
}));
jest.unstable_mockModule('../server/memory.js', () => ({
  updateAgentTask: jest.fn(async () => {}),
  getSubAgentById: jest.fn(async () => ({ id: 'sub-agent-3', name: 'Pat the planner' })),
  sendAgentMessage: jest.fn(async () => {}),
  buildCompletionReceipt: jest.fn(() => null),
}));
jest.unstable_mockModule('../server/routes/chat/index.js', () => ({
  buildSubAgentSystemPrompt: jest.fn(async () => { throw new Error('stop here'); }),
  getSubAgentModelConfig: jest.fn(),
}));
jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  callModel: jest.fn(), createModelAccessContext: jest.fn(), workspaceUsageSink: jest.fn(),
}));
jest.unstable_mockModule('../server/tools.js', () => ({ executeTool: jest.fn(), filterToolsForAgent: jest.fn() }));
jest.unstable_mockModule('../server/task-worker/batch.js', () => ({ checkBatchCompletion: jest.fn() }));

const { runTask } = await import('../server/task-worker/execution.js');

test('the task start line carries ids and priority, never the title or agent name', async () => {
  await runTask({
    id: 'task-9', assignee_id: 'sub-agent-3', workspace_id: 'ws-1', created_by_user_id: 4,
    title: 'Email Sam at Testco about the Bright Paws invoice', priority: 'high',
  });
  const start = lines.find((l) => l.msg === 'task start');
  expect(start.meta).toEqual({ taskId: 'task-9', agentId: 'sub-agent-3', priority: 'high' });
  expect(JSON.stringify(start)).not.toMatch(/Sam|Testco|Bright Paws|Pat the planner/);
});
