import { jest } from '@jest/globals';

// Nano-agent helpers (Alex's diagram 15, bottom row): a sub-agent starts a
// one-job helper with Alex's ai_call prompt and Temp .02; the answer goes
// into the sub-agent's data box and the helper ends. Only sub-agents can.

const saved = [];
const SUBS = [{ id: 'sub-1', parent_id: 'nexus', name: 'Scout', created_at: '2026-10-16T09:00:00Z', model_provider: 'ollama', model_name: 'gemma' }];
jest.unstable_mockModule('../server/memory.js', () => ({
  getSubAgentById: jest.fn(async (id) => SUBS.find((s) => s.id === id) || null),
  getSubAgents: jest.fn(async (parentId) => SUBS.filter((s) => s.parent_id === parentId)),
  scratchpadWrite: jest.fn(async (id, project, key, value) => { saved.push({ id, project, key, value }); return { key, value }; }),
}));
jest.unstable_mockModule('../server/routes/chat/prompts.js', () => ({
  getSubAgentModelConfig: () => ({ modelProvider: 'ollama', modelName: 'gemma', baseUrl: 'http://x', apiKey: '' }),
}));
jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  callModel: jest.fn(),
  createModelAccessContext: (ctx) => ctx,
  workspaceUsageSink: () => {},
}));

const { helperJob, helperPrompt, helperKey, HELPER_TEMPERATURE } = await import('../src/lib/agents/nanoHelpers.js');
const { handleStartHelper } = await import('../server/tools/handlers/nanoHelper.js');
const { SHARED_SUB_AGENT_TOOLS } = await import('../server/tools/rbac/constants.js');
const ctx = { workspaceId: 'w1', userId: 1 };

describe('nano helpers', () => {
  test('six jobs, Alex\'s ai_call prompt, and a timed box key', () => {
    expect(helperJob(' Review ')).toBe('review');
    expect(helperJob('deploy')).toBeNull();
    expect(helperPrompt({ name: 'Scout helper (review)', job: 'review', parent: 'Scout', task: 'check the plan.' }))
      .toMatch(/^You are Scout helper \(review\), the review agent for Scout, your task is to check the plan\.\nPlease make sure you are thorough, and remember correctness beats speed every time\. Thank you!/);
    expect(helperKey('edit', new Date('2026-10-16T14:05:09Z'))).toBe('helper edit 14:05:09');
    expect(HELPER_TEMPERATURE).toBe(0.02);
  });

  test('a sub-agent\'s helper answers once and the answer lands in its data box', async () => {
    const ask = jest.fn(async () => ({ choices: [{ message: { content: 'Step 3 is missing a check.' } }] }));
    const out = await handleStartHelper('sub-1', { job: 'review', task: 'check the plan', input: '1. a\n2. b' }, ctx, { ask });
    const body = ask.mock.calls[0][0].body;
    expect(body.temperature).toBe(0.02);
    expect(body.tools).toBeUndefined();
    expect(body.messages[1].content).toBe('check the plan\n\n---\n1. a\n2. b');
    expect(saved[0]).toMatchObject({ id: 'sub-1', project: 'default', value: 'Step 3 is missing a check.' });
    expect(out).toMatch(/^The review helper finished and was saved in your data box 001 as "helper review /);
  });

  test('main agents and unknown jobs are turned away without a model call', async () => {
    const ask = jest.fn();
    expect(await handleStartHelper('nexus', { job: 'review', task: 'x' }, ctx, { ask })).toMatch(/Only a sub-agent/);
    expect(await handleStartHelper('sub-1', { job: 'deploy', task: 'x' }, ctx, { ask })).toMatch(/Pick one job/);
    expect(ask).not.toHaveBeenCalled();
    expect(SHARED_SUB_AGENT_TOOLS).toContain('start_helper');
  });
});
