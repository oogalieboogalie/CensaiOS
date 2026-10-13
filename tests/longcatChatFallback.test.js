import { jest } from '@jest/globals';

const executeTool = jest.fn(async () => 'edited');
const callModel = jest.fn();
const createModelAccessContext = jest.fn(value => ({ ...value, branded: true }));

jest.unstable_mockModule('../server/tools.js', () => ({
  executeTool,
  TOOL_DEFINITIONS: [],
}));

jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  aiGatewayLog: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  CHAT_COMPLETION_TIMEOUT_MS: 30000,
  DEFAULT_CHAT_BASE_URL: 'http://stub',
  DEFAULT_CHAT_MODEL: 'longcat',
  OLLAMA_CHAT_MODEL_ALIASES: [],
  getDefaultChatApiKey: jest.fn(() => 'key'),
  callModel,
  createModelAccessContext,
  workspaceUsageSink: jest.fn(),
}));
jest.unstable_mockModule('../server/routes/chat/prompts.js', () => ({
  shouldSynthesizeAfterToolBatch: () => false,
  buildToolSynthesisPrompt: () => '',
  summarizeToolActions: () => '(tools ran)',
}));

const { runChatLoop } = await import('../server/routes/chat/chatExecution.js');

test('chat loop executes a longcat text tool call', async () => {
  callModel
    .mockResolvedValueOnce({
      choices: [{
        message: {
          role: 'assistant',
          content: [
            '<longcattoolcall>project_read',
            '<longcatargkey>path</longcatargkey>',
            '<longcatargvalue>README.md</longcatargvalue>',
            '</longcattoolcall>',
          ].join('\n'),
        },
      }],
    })
    .mockResolvedValueOnce({
      choices: [{ message: { role: 'assistant', content: 'Read complete.' } }],
    });

  const result = await runChatLoop({
    agentId: 'atlas',
    chatMessages: [{ role: 'user', content: 'read it' }],
    toolsForCaller: [],
    reqModel: 'longcat',
    authorizationWorkspaceId: 'workspace-1',
    userId: 7,
    sendEvent: jest.fn(),
    timings: { model_ms: 0, tool_ms: 0, model_calls: [], tool_calls: [] },
  });

  expect(executeTool).toHaveBeenCalledWith(
    'atlas',
    'project_read',
    expect.objectContaining({ path: 'README.md' }),
    { userId: 7, workspaceId: 'workspace-1' },
  );
  expect(createModelAccessContext).toHaveBeenCalledWith({
    userId: 7,
    workspaceId: 'workspace-1',
    source: 'chat-loop',
  });
  expect(callModel).toHaveBeenCalledWith(expect.objectContaining({
    accessContext: {
      userId: 7,
      workspaceId: 'workspace-1',
      source: 'chat-loop',
      branded: true,
    },
  }));
  expect(result.finalText).toBe('Read complete.');
});
