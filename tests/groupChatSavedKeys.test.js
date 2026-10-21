/**
 * @jest-environment jsdom
 */
// Group chat uses the key saved in Settings, the same way a one-to-one chat
// does. Nothing here calls a real model: the stand-in answers in this process.
import React from 'react';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

const VAULT_KEY = 'vault-openai-example';
const OWNER_KEY = 'owner-anthropic-example';
const LOCAL = 'http://127.0.0.1:59999/v1';

const getUserApiKeyConfig = jest.fn(async () => null);
const callModel = jest.fn(async () => ({ choices: [{ message: { content: 'Stand-in answer.' } }] }));
const resolveChatModelConfig = jest.fn(({ modelProvider = null, modelName = null } = {}) => {
  if (modelProvider === 'openai') {
    return { provider: 'openai', model: modelName || 'gpt-4.1', baseUrl: 'https://api.openai.com/v1', apiKey: process.env.OPENAI_API_KEY || '' };
  }
  if (modelProvider === 'anthropic') {
    return { provider: 'anthropic', model: modelName || 'claude-sonnet', baseUrl: 'https://api.anthropic.com/v1', apiKey: process.env.ANTHROPIC_API_KEY || '' };
  }
  return { provider: null, model: 'local-model', baseUrl: LOCAL, apiKey: 'ollama' };
});
const dbQuery = jest.fn(async () => ({ rows: [] }));
const getSubAgentById = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({ default: { query: dbQuery } }));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/memory.js', () => ({
  getAgentsByIds: jest.fn(async () => []),
  buildSystemPrompt: jest.fn(async () => 'family prompt'),
  getSubAgentById,
}));
jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  callModel,
  createModelAccessContext: jest.fn(input => input),
  resolveChatModelConfig,
  resolveImageGenerationModelConfig: jest.fn(),
  IMAGE_GENERATION_MODEL_KIND: 'image',
  workspaceUsageSink: jest.fn(),
}));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({
  resolveWorkspaceContext: jest.fn(async () => ({ id: 'ws-1' })),
}));
jest.unstable_mockModule('../server/security/userApiKeys.js', () => ({
  getUserApiKeyConfig,
  inferUserApiKeyProvider: (provider) => {
    const id = String(provider || '').trim().toLowerCase();
    if (id === 'claude') return 'anthropic';
    return ['anthropic', 'openai', 'openrouter', 'google'].includes(id) ? id : null;
  },
}));

const { handleGroupChat } = await import('../server/routes/chat/handlers.js');
const { onLogRecord } = await import('../server/logger.js');
const { resetKeySharingCache } = await import('../server/security/keySharing.js');
const { GroupChatWindow } = await import('../src/components/GroupChatWindow.jsx');

const LEAD = { id: 'lead-1', name: 'Lead', role: 'Splits the job', system_prompt: 'You are the Lead.', model_provider: null, model_name: null };
const CRITIC = { id: 'critic-1', name: 'Critic', role: 'Checks the work', system_prompt: 'You are the Critic.', model_provider: null, model_name: null };
const KEY_ENV = ['AI_API_KEY', 'AI_BASE_URL', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'XAI_API_KEY', 'CENSAI_MODE', 'HOMEBASE_STATE_DIR'];

const logs = [];
let stopLog;
let savedEnv;
let stateDir;

function responseDouble() {
  return { json: jest.fn(), status: jest.fn(function status() { return this; }), setHeader: jest.fn() };
}

function groupChat(userId, userRole, agentIds, text) {
  const res = responseDouble();
  return handleGroupChat({
    body: { agentIds, workspaceId: 'ws-1', messages: [{ from: 'me', text }] },
    session: { userId, userRole },
  }, res).then(() => res);
}

beforeAll(() => {
  stopLog = onLogRecord((record) => { logs.push(record); });
  savedEnv = Object.fromEntries(KEY_ENV.map(name => [name, process.env[name]]));
});

afterAll(() => {
  stopLog?.();
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

beforeEach(() => {
  logs.length = 0;
  jest.clearAllMocks();
  for (const name of KEY_ENV) delete process.env[name];
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'group-keys-'));
  process.env.HOMEBASE_STATE_DIR = stateDir;
  process.env.CENSAI_MODE = 'local_desktop';
  resetKeySharingCache();
  getSubAgentById.mockImplementation(async (id, scope) => {
    if (scope?.workspaceId !== 'ws-1') return null;
    return { [LEAD.id]: LEAD, [CRITIC.id]: CRITIC }[id] || null;
  });
  dbQuery.mockImplementation(async (sql) => {
    if (/SELECT provider FROM user_api_keys/i.test(sql)) return { rows: [{ provider: 'openai' }] };
    if (/SELECT role FROM users/i.test(sql)) return { rows: [{ role: 'admin' }] };
    return { rows: [] };
  });
  getUserApiKeyConfig.mockImplementation(async (userId, provider) => (
    Number(userId) === 7 && provider === 'openai' ? { apiKey: VAULT_KEY, modelName: null } : null
  ));
  global.fetch = jest.fn(async () => { throw new Error('down'); });
});

afterEach(() => {
  fs.rmSync(stateDir, { recursive: true, force: true });
});

describe('group chat with a key saved only in the vault', () => {
  test('two agents both answer with the stand-in model', async () => {
    const res = await groupChat(7, 'admin', [LEAD.id, CRITIC.id], 'Plan the launch page');

    expect(callModel).toHaveBeenCalledTimes(2);
    for (const [arg] of callModel.mock.calls) {
      expect(arg.config).toMatchObject({ provider: 'openai', model: 'gpt-4.1', apiKey: VAULT_KEY });
      expect(arg.config.baseUrl).toBe('https://api.openai.com/v1');
    }
    expect(res.json).toHaveBeenCalledWith({
      replies: [
        { agentId: LEAD.id, text: 'Stand-in answer.' },
        { agentId: CRITIC.id, text: 'Stand-in answer.' },
      ],
    });
    const round = logs.filter(record => record.namespace === 'group-chat');
    expect(round.map(record => record.message)).toEqual(['round: 2 of 2 answered']);
    expect(JSON.stringify(round)).not.toContain('Plan the launch page');
    expect(JSON.stringify(round)).not.toContain(VAULT_KEY);
  });

  test('a teammate cannot use the owner key', async () => {
    process.env.ANTHROPIC_API_KEY = OWNER_KEY;
    getSubAgentById.mockImplementation(async (id) => ({
      ...({ [LEAD.id]: LEAD, [CRITIC.id]: CRITIC }[id]),
      model_provider: 'anthropic',
      model_name: 'claude-sonnet',
    }));

    const res = await groupChat(8, 'user', [LEAD.id, CRITIC.id], 'Use the owner key');

    expect(callModel).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'MODEL_KEY_MISSING',
      keyProvider: 'anthropic',
    }));
    const round = logs.filter(record => record.namespace === 'group-chat');
    expect(round.map(record => record.message)).toEqual(['round: 0 of 2 answered; no key']);
    expect(JSON.stringify(logs)).not.toContain(OWNER_KEY);
    expect(JSON.stringify(logs)).not.toContain('Use the owner key');
  });
});

function TeamChat() {
  const [win, setWin] = React.useState({
    id: 'team-chat', title: 'Team Chat', members: ['censai', 'atlas'], msgs: [],
  });
  return <GroupChatWindow win={win} onUpdate={(patch) => setWin(current => ({ ...current, ...patch }))} />;
}

describe('the key card in Team Chat', () => {
  test('with no key the card shows, and pasting a key sends the message', async () => {
    let chats = 0;
    global.fetch = jest.fn(async (url) => {
      if (String(url) === '/api/keys') return { ok: true, json: async () => ({ ok: true }) };
      chats += 1;
      if (chats === 1) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            error: 'No AI is set up for this chat yet. Paste a key from Claude, OpenAI or OpenRouter to send your message.',
            code: 'MODEL_KEY_MISSING',
            keyProvider: null,
            retryAfter: null,
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          replies: [
            { agentId: 'censai', text: 'Sam Example would start with the brief.' },
            { agentId: 'atlas', text: 'Pat Example would check the numbers.' },
          ],
        }),
      };
    });

    render(<TeamChat />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'hello team' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByTestId('chat-key-needed')).toHaveTextContent('No AI is set up');
    expect(screen.queryByText(/Check that an AI key is set/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Anthropic (Claude) key'), { target: { value: 'sk-ant-example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and send' }));

    expect(await screen.findByText('Sam Example would start with the brief.')).toBeInTheDocument();
    expect(screen.getByText('Pat Example would check the numbers.')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-key-needed')).not.toBeInTheDocument();

    const chatCalls = global.fetch.mock.calls.filter(call => String(call[0]) === '/api/group-chat');
    expect(chatCalls).toHaveLength(2);
    expect(JSON.parse(chatCalls[1][1].body).messages.map(message => message.text)).toEqual(['hello team']);
    expect(JSON.parse(global.fetch.mock.calls.find(call => String(call[0]) === '/api/keys')[1].body)).toMatchObject({
      provider: 'anthropic', apiKey: 'sk-ant-example',
    });
  });
});
