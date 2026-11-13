import { jest } from '@jest/globals';

// Pat owns this computer, so the owner check would let a tool through.
// Scout is a custom agent and Helper is a sub-agent: neither is one of the
// eight built-in family agents. This run gives them only web_search.
// Asking for local_read_file, as a real tool call or as the text form
// <longcattoolcall>, must not read the file. The same refusal has to hold
// inside the real executeTool, because that is what an outside caller's
// run actually reaches.
const PAT = 1;
const BOARD = 'made-up-board';
const FILE = '/made/up/notes.txt';
const AGENTS = ['made-up-scout', 'made-up-helper'];

const ran = jest.fn(async (_agentId, name) => `${name} ran`);
const pool = { query: jest.fn(), connect: jest.fn(), on: jest.fn(), end: jest.fn() };
const callModel = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({ default: pool, createDbPool: () => pool }));
jest.unstable_mockModule('../server/tools/handlers/index.js', () => ({
  TOOL_REGISTRY: {
    local_read_file: ran,
    web_search: ran,
    project_read: ran,
    recall: ran,
    journal: ran,
    broadcast: ran,
    remember_important: ran,
    vex_run: ran,
  },
}));
jest.unstable_mockModule('../server/aiGateway/callModel.js', () => ({
  CHAT_COMPLETION_MODEL_KIND: 'chat.completion',
  callModel,
}));

const { executeTool, filterToolsForAgent } = await import('../server/tools.js');
const { familyDefaultToolNames } = await import('../server/tools/rbac/familyBaseline.js');
const { onLogRecord } = await import('../server/logger.js');
const { runChatLoop } = await import('../server/routes/chat/chatExecution.js');
const { runWakeModel } = await import('../server/agent-wakeups/modelLoop.js');
const { runTask } = await import('../server/task-worker/execution.js');
const { toolRunner } = await import('../server/runEngine/index.js');
const {
  outsideOfferedTools, runWithOfferedTools, scheduleOutsideRun, toolNotOfferedResult,
} = await import('../server/tools/rbac/offeredTools.js');

const tools = (...names) => names.map((name) => ({
  type: 'function',
  function: { name, parameters: { type: 'object', properties: {} } },
}));
const asks = (name, args) => ({
  choices: [{
    message: {
      role: 'assistant',
      tool_calls: [{ id: 'made-up-call-0', function: { name, arguments: JSON.stringify(args) } }],
    },
  }],
});
const says = (content) => ({ choices: [{ message: { role: 'assistant', content } }] });
const longcat = (name, key, value) => (
  `<longcattoolcall>${name}<longcatarg_key>${key}</longcatarg_key><longcatarg_value>${value}</longcatarg_value></longcattoolcall>`
);
const called = () => ran.mock.calls.map((call) => call[1]);

function chat(agentId, toolsForCaller) {
  return runChatLoop({
    agentId,
    chatMessages: [
      { role: 'system', content: 'Made-up system words.' },
      { role: 'user', content: 'Made-up ask.' },
    ],
    toolsForCaller,
    reqModel: 'made-up-model',
    reqBaseUrl: 'http://made-up.invalid',
    reqApiKey: 'made-up-key',
    reqProvider: 'made-up',
    userId: PAT,
    authorizationWorkspaceId: BOARD,
    sendEvent: jest.fn(),
    timings: { model_ms: 0, tool_ms: 0, model_calls: [], tool_calls: [] },
  });
}

const priorMode = process.env.CENSAI_MODE;

beforeEach(() => {
  jest.clearAllMocks();
  callModel.mockReset();
  ran.mockImplementation(async (_agentId, name) => `${name} ran`);
  process.env.CENSAI_MODE = 'local_desktop';
  pool.query.mockImplementation(async (sql) => {
    if (String(sql).includes('FROM users')) return { rows: [{ role: 'admin' }] };
    return { rows: [] };
  });
});

afterAll(() => {
  if (priorMode === undefined) delete process.env.CENSAI_MODE;
  else process.env.CENSAI_MODE = priorMode;
});

describe('a model loop that forgot its list is not silent in dev or test', () => {
  test('executeTool warns once when no run stored a list', async () => {
    const seen = [];
    const stop = onLogRecord((record) => {
      if (record.namespace === 'tools' && record.level === 'warn') seen.push(record.message);
    });
    try {
      const first = await executeTool('made-up-scout', 'local_read_file', { file_path: FILE }, {
        userId: PAT, workspaceId: BOARD,
      });
      const second = await executeTool('made-up-scout', 'local_read_file', { file_path: FILE }, {
        userId: PAT, workspaceId: BOARD,
      });
      expect(first).toBe('local_read_file ran');
      expect(second).toBe('local_read_file ran');
      expect(seen).toEqual([
        'executeTool ran with no offered-tool list; a model loop that forgot to store its list would fail open',
      ]);
    } finally {
      stop();
    }
  });
});

describe('markers the prompt tells a family agent to write still run', () => {
  const markerTools = ['journal', 'broadcast', 'remember_important'];

  test('Atlas runs [JOURNAL] and [BROADCAST]', async () => {
    const offered = familyDefaultToolNames('atlas');
    expect(offered).toEqual(expect.arrayContaining(markerTools));
    callModel.mockResolvedValueOnce(says([
      'Done.',
      '[JOURNAL: a private note]',
      '[BROADCAST: hello board]',
      '[REMEMBER_IMPORTANT: keep the spare key in the drawer]',
    ].join('\n')));
    await chat('atlas', offered.map((name) => ({
      type: 'function',
      function: { name, parameters: { type: 'object', properties: {} } },
    })));
    expect(called().filter((name) => markerTools.includes(name))).toEqual(markerTools);
  });

  test('an ordinary custom agent is offered the same markers until its scope leaves them out', async () => {
    const open = (await filterToolsForAgent('made-up-scout', { workspaceId: BOARD, userId: PAT }))
      .map((entry) => entry.function.name);
    expect(open).toEqual(expect.arrayContaining(markerTools));

    pool.query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM users')) return { rows: [{ role: 'admin' }] };
      if (text.includes('FROM agents')) {
        return { rows: [{ id: 'made-up-scout', tool_scopes: { mode: 'custom', tools: ['web_search'] } }] };
      }
      return { rows: [] };
    });
    const narrow = (await filterToolsForAgent('made-up-scout', { workspaceId: BOARD, userId: PAT }))
      .map((entry) => entry.function.name);
    expect(narrow.filter((name) => markerTools.includes(name))).toEqual([]);
    expect(narrow).toContain('web_search');
  });
});

describe('a custom agent or a sub-agent runs only the tools this run offered', () => {
  test.each(AGENTS)('%s is refused when it asks for local_read_file as a tool call', async (agentId) => {
    callModel.mockResolvedValueOnce(asks('local_read_file', { file_path: FILE }))
      .mockResolvedValueOnce(says('Made-up answer.'));
    const { toolActions } = await chat(agentId, tools('web_search'));
    expect(called()).toEqual([]);
    expect(toolActions.map((action) => [action.tool, action.ok, action.result])).toEqual([
      ['local_read_file', false, toolNotOfferedResult('local_read_file')],
    ]);
  });

  test.each(AGENTS)('%s is refused when it asks for local_read_file in the text form', async (agentId) => {
    callModel.mockResolvedValueOnce(says(longcat('local_read_file', 'file_path', FILE)))
      .mockResolvedValueOnce(says('Made-up answer.'));
    const { toolActions } = await chat(agentId, tools('web_search'));
    expect(called()).toEqual([]);
    expect(toolActions.map((action) => [action.tool, action.ok, action.result])).toEqual([
      ['local_read_file', false, toolNotOfferedResult('local_read_file')],
    ]);
  });

  test('the real executeTool refuses local_read_file during that run, and a family agent too', async () => {
    ran.mockImplementation(async (agentId, name) => {
      if (name !== 'web_search') return `${name} ran`;
      const read = await executeTool(agentId, 'local_read_file', { file_path: FILE }, {
        userId: PAT, workspaceId: BOARD,
      });
      const project = await executeTool('censai', 'project_read', { path: 'made-up.md' }, {
        userId: PAT, workspaceId: BOARD,
      });
      return `${read}\n${project}`;
    });
    callModel.mockResolvedValueOnce(asks('web_search', { query: 'made-up' }))
      .mockResolvedValueOnce(says('Made-up answer.'));
    const { toolActions } = await chat('made-up-scout', tools('web_search'));
    expect(called()).toEqual(['web_search']);
    expect(toolActions[0].ok).toBe(false);
    expect(toolActions[0].result).toBe(
      `${toolNotOfferedResult('local_read_file')}\n${toolNotOfferedResult('project_read')}`,
    );
  });

  test('a long code block in the answer is still scanned by the server', async () => {
    const sample = `\`\`\`js\n${'const madeUp = 1;\n'.repeat(8)}\`\`\``;
    callModel.mockResolvedValueOnce(says(`Made-up answer.\n${sample}`));
    await chat('made-up-scout', tools('web_search'));
    expect(called()).toEqual(['vex_run']);
  });

  test('an agent waking up stores the same list, so executeTool still refuses local_read_file', async () => {
    ran.mockImplementation(async (agentId, name) => {
      if (name !== 'recall') return `${name} ran`;
      return executeTool(agentId, 'local_read_file', { file_path: FILE }, { userId: PAT, workspaceId: BOARD });
    });
    callModel.mockResolvedValueOnce(asks('recall', { query: 'made-up' }))
      .mockResolvedValueOnce(says('Made-up answer.'));
    await runWakeModel({
      agent: { id: 'made-up-scout' }, systemPrompt: 'Made-up system words.', userPrompt: 'Made-up ask.',
      wakeId: 'made-up-wake', messageId: 'made-up-message', workspaceId: BOARD, userId: PAT,
    });
    expect(called()).toEqual(['recall']);
  });

  test('a task handed to a helper stores the same list', async () => {
    pool.query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM users')) return { rows: [{ role: 'admin' }] };
      if (text.includes('FROM sub_agents WHERE id')) {
        return { rows: [{
          id: 'made-up-helper', name: 'Helper', permission: 'researcher', active: true,
          tool_scopes: { mode: 'custom', tools: ['web_search'] },
        }] };
      }
      return { rows: [] };
    });
    ran.mockImplementation(async (agentId, name) => {
      if (name !== 'web_search') return `${name} ran`;
      return executeTool(agentId, 'local_read_file', { file_path: FILE }, { userId: PAT, workspaceId: BOARD });
    });
    callModel.mockResolvedValueOnce(asks('web_search', { query: 'made-up' }))
      .mockResolvedValueOnce(says('## Summary of Changes\n- Made up.\n## Verification Steps\n- Made up.'));
    await runTask({
      id: 'made-up-task', assignee_id: 'made-up-helper', title: 'Made-up task', prompt: 'Made-up ask.',
      priority: 'normal', workspace_id: BOARD, created_by_user_id: PAT,
    });
    expect(called()).toEqual(['web_search']);
  });

  test('a tool this run did offer still runs', async () => {
    callModel.mockResolvedValueOnce(asks('web_search', { query: 'made-up' }))
      .mockResolvedValueOnce(says('Made-up answer.'));
    const { toolActions } = await chat('made-up-helper', tools('web_search'));
    expect(called()).toEqual(['web_search']);
    expect(toolActions.map((action) => [action.tool, action.ok, action.result])).toEqual([
      ['web_search', true, 'web_search ran'],
    ]);
  });
});

describe('an outside tool skips executeTool, so the run list is checked there too', () => {
  const outside = {
    definitions: [{ type: 'function', function: { name: 'outside_write' } }],
    has: (name) => name === 'outside_write',
    call: jest.fn(async () => 'outside ran'),
  };

  beforeEach(() => { outside.call.mockClear(); });

  test('a name this run did not offer does not run', async () => {
    const run = toolRunner(outside);
    const result = await runWithOfferedTools(tools('web_search'), () => (
      run('made-up-scout', 'outside_write', { path: FILE }, { userId: PAT })
    ));
    expect(result).toBe(toolNotOfferedResult('outside_write'));
    expect(outside.call).not.toHaveBeenCalled();
  });

  test('a name this run did offer still runs', async () => {
    const run = toolRunner(outside);
    const result = await runWithOfferedTools(tools('outside_write'), () => (
      run('made-up-scout', 'outside_write', {}, { userId: PAT })
    ));
    expect(result).toBe('outside ran');
    expect(outside.call).toHaveBeenCalledTimes(1);
  });
});

describe('a check the server itself starts during a run is not a tool the model named', () => {
  test('the fixed vulnerability scan still runs', async () => {
    const result = await runWithOfferedTools(tools('web_search'), () => outsideOfferedTools(() => (
      executeTool('made-up-scout', 'vex_run', { task: 'vulnerability_check' }, { userId: PAT, workspaceId: BOARD })
    )));
    expect(result).toBe('vex_run ran');
    expect(called()).toEqual(['vex_run']);
  });
});

describe('a background timer must not keep the run that started it', () => {
  test('a timer started during a run refuses later work; one scheduled outside the run does not', async () => {
    const read = (file) => executeTool('made-up-scout', 'local_read_file', { file_path: file }, {
      userId: PAT, workspaceId: BOARD,
    });
    let kept;
    let detached;
    await runWithOfferedTools(tools('web_search'), () => {
      kept = new Promise((resolve) => {
        const timer = setTimeout(() => { resolve(read(FILE)); }, 20);
        timer.unref?.();
      });
      scheduleOutsideRun(() => {
        detached = new Promise((resolve) => {
          const timer = setTimeout(() => { resolve(read(FILE)); }, 20);
          timer.unref?.();
        });
      });
    });
    expect(await kept).toBe(toolNotOfferedResult('local_read_file'));
    expect(await detached).toBe('local_read_file ran');
    expect(called()).toEqual(['local_read_file']);
  });
});

describe('a call that is not part of a model run keeps the checks it already had', () => {
  test('the owner can still read a file when no run offered a list', async () => {
    const result = await executeTool('made-up-scout', 'local_read_file', { file_path: FILE }, {
      userId: PAT, workspaceId: BOARD,
    });
    expect(result).toBe('local_read_file ran');
    expect(called()).toEqual(['local_read_file']);
  });
});
