import { jest } from '@jest/globals';
import crypto from 'crypto';

const requireWorkspaceMember = jest.fn(async () => ({ role: 'member' }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));
jest.unstable_mockModule('../server/agent-registry/access.js', () => ({
  actorWithWorkspaceAccess: async (actor) => ({ ...actor, workspaceIds: ['ws-a'] }),
}));
const createAgentCardRun = jest.fn();
jest.unstable_mockModule('../server/agent-card-runs/store.js', () => ({ createAgentCardRun }));

const {
  cancelHelpRequest, composeHelpPrompt, createHelpRequest, decideHelpRequest, listHelpRequests,
} = await import('../server/agent-registry/helpRequests.js');

const N8N = { kind: 'n8n_chat', status: 'executable', protocolVersion: 'n8n-chat-v1', transport: 'HTTP_JSON', endpoint: 'https://n8n.example/webhook/x/chat', sourceDigest: 'd' };
const CARDS = {
  'agent:nexus': { id: 'agent:nexus', name: 'Nexus', visibility: 'public', owner_id: null, workspace_id: null,
    skills: [{ id: 'write-migration', name: 'Write migration', description: 'Forward-only.' }] },
  'ext:n8n:mine': { id: 'ext:n8n:mine', name: 'Team bot', visibility: 'workspace', owner_id: '7', workspace_id: 'ws-a',
    endpoint: N8N.endpoint, auth: { type: 'none' }, skills: [],
    metadata: { executor: N8N, import: { kind: 'n8n_chat', sourceDigest: 'd', webhookUrl: N8N.endpoint } } },
  'ext:n8n:theirs': { id: 'ext:n8n:theirs', name: 'Their bot', visibility: 'public', owner_id: '9', workspace_id: 'ws-z',
    endpoint: N8N.endpoint, auth: { type: 'none' }, skills: [],
    metadata: { executor: N8N, import: { kind: 'n8n_chat', sourceDigest: 'd', webhookUrl: N8N.endpoint } } },
  'ext:7:descriptive': { id: 'ext:7:descriptive', name: 'Card only', visibility: 'workspace', owner_id: '7', workspace_id: 'ws-a', skills: [] },
  'ext:9:closed': { id: 'ext:9:closed', name: 'Closed', visibility: 'public', owner_id: '9', workspace_id: 'ws-z',
    skills: [], metadata: { acceptsHelpRequests: false } },
};

function fakeDb({ installed = [] } = {}) {
  const rows = new Map();
  const runs = new Map();
  const joined = (row) => ({ ...row, target_name: CARDS[row.target_card_id]?.name, run_status: runs.get(row.run_id)?.status, run_result: runs.get(row.run_id)?.result, run_failure: null });
  const query = jest.fn(async (sql, p = []) => {
    if (sql.includes('FROM agent_cards WHERE id=$1')) return { rows: CARDS[p[0]] ? [CARDS[p[0]]] : [] };
    if (sql.includes('workspace_agent_card_installs')) return { rows: installed.includes(p[1]) ? [{}] : [] };
    if (sql.startsWith('INSERT INTO agent_help_requests')) {
      const row = { id: crypto.randomUUID(), workspace_id: p[0], target_card_id: p[1], target_owner_id: p[2], requester_kind: p[3], requester_id: p[4], requested_by_user_id: p[5], skill_id: p[6], task: p[7], status: p[8], run_id: null, created_at: new Date() };
      rows.set(row.id, row);
      return { rows: [row] };
    }
    if (sql.includes("SET status='dispatched', run_id=$2")) { Object.assign(rows.get(p[0]), { status: 'dispatched', run_id: p[1] }); return { rows: [] }; }
    if (sql.includes("SET status='dispatch_failed'")) { Object.assign(rows.get(p[0]), { status: 'dispatch_failed', error: p[1] }); return { rows: [] }; }
    if (sql.includes('SET status=$2')) {
      const row = rows.get(p[0]);
      const field = sql.includes('target_owner_id=$5') ? 'target_owner_id' : 'workspace_id';
      if (!row || row.status !== 'pending' || row[field] !== p[4]) return { rows: [] };
      Object.assign(row, { status: p[1], decided_by_user_id: p[2], decision_note: p[3], decided_at: new Date() });
      return { rows: [row] };
    }
    if (sql.includes('WHERE h.id=$1')) return { rows: rows.has(p[0]) ? [joined(rows.get(p[0]))] : [] };
    if (sql.includes('WHERE h.workspace_id=$1')) return { rows: [...rows.values()].filter((r) => r.workspace_id === p[0]).map(joined) };
    if (sql.includes('WHERE h.target_owner_id=$1')) return { rows: [...rows.values()].filter((r) => r.target_owner_id === p[0] && r.workspace_id !== p[1]).map(joined) };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  return { query, rows, runs };
}

beforeEach(() => {
  jest.clearAllMocks();
  createAgentCardRun.mockImplementation(async () => ({ runId: crypto.randomUUID(), taskId: 'x', status: 'queued' }));
});

const base = { workspaceId: 'ws-a', userId: 7, requester: { kind: 'user', id: '7' } };

test('a request to a built-in card dispatches at once on the requester BYOK identity', async () => {
  const db = fakeDb();
  const result = await createHelpRequest(db, { ...base, cardId: 'agent:nexus', task: 'Add an index', skillId: 'write-migration', createRun: createAgentCardRun });
  expect(result).toMatchObject({ cardId: 'agent:nexus', cardName: 'Nexus', status: 'unknown', skillId: 'write-migration' });
  const call = createAgentCardRun.mock.calls[0][0];
  expect(call).toMatchObject({ callerId: 7, options: { workspaceId: 'ws-a' }, clientTaskId: `help:${result.id}` });
  expect(call.payload.prompt).toContain('Skill requested: Write migration (Forward-only.)');
  expect(call.payload.prompt).toContain('Add an index');
  expect(db.rows.get(result.id)).toMatchObject({ status: 'dispatched', run_id: expect.any(String) });
  expect(requireWorkspaceMember).toHaveBeenCalledWith(db, { workspaceId: 'ws-a', userId: 7, roles: ['owner', 'admin', 'member'] });
});

test('run status maps to queued / working / completed with the helper result', async () => {
  const db = fakeDb();
  const created = await createHelpRequest(db, { ...base, cardId: 'ext:n8n:mine', task: 'hi', createRun: createAgentCardRun });
  const runId = db.rows.get(created.id).run_id;
  for (const [status, expected] of [['pending', 'queued'], ['running', 'working'], ['succeeded', 'completed']]) {
    db.runs.set(runId, { status, result: 'done!' });
    const { outgoing } = await listHelpRequests(db, { workspaceId: 'ws-a', userId: 7 });
    expect(outgoing[0].status).toBe(expected);
    expect(outgoing[0].result).toBe(expected === 'completed' ? 'done!' : null);
  }
});

test('someone else\'s public card waits for its owner, who can accept it', async () => {
  const db = fakeDb();
  const pending = await createHelpRequest(db, { ...base, cardId: 'ext:n8n:theirs', task: 'please', createRun: createAgentCardRun });
  expect(pending.status).toBe('pending');
  expect(createAgentCardRun).not.toHaveBeenCalled();

  const { incoming } = await listHelpRequests(db, { workspaceId: 'ws-z', userId: 9 });
  expect(incoming).toHaveLength(1);
  expect(incoming[0]).toMatchObject({ side: 'incoming', status: 'pending', task: 'please', result: null });
  expect(incoming[0].workspaceId).toBeUndefined();

  await expect(decideHelpRequest(db, { id: pending.id, userId: 8, decision: 'accept', createRun: createAgentCardRun }))
    .rejects.toMatchObject({ statusCode: 409 });
  await decideHelpRequest(db, { id: pending.id, userId: 9, decision: 'accept', note: 'sure', createRun: createAgentCardRun });
  expect(createAgentCardRun).toHaveBeenCalledTimes(1);
  expect(createAgentCardRun.mock.calls[0][0].callerId).toBe(7);
  expect(db.rows.get(pending.id)).toMatchObject({ status: 'dispatched', decision_note: 'sure' });
  await expect(decideHelpRequest(db, { id: pending.id, userId: 9, decision: 'decline' }))
    .rejects.toMatchObject({ code: 'AGENT_HELP_NOT_PENDING' });
});

test('owners can decline and requesters can cancel only pending requests', async () => {
  const db = fakeDb();
  const a = await createHelpRequest(db, { ...base, cardId: 'ext:n8n:theirs', task: 'one' });
  const b = await createHelpRequest(db, { ...base, cardId: 'ext:n8n:theirs', task: 'two' });
  expect((await decideHelpRequest(db, { id: a.id, userId: 9, decision: 'decline' })).status).toBe('declined');
  await expect(cancelHelpRequest(db, { id: b.id, workspaceId: 'ws-other', userId: 7 })).rejects.toMatchObject({ statusCode: 409 });
  expect((await cancelHelpRequest(db, { id: b.id, workspaceId: 'ws-a', userId: 7 })).status).toBe('cancelled');
  await expect(decideHelpRequest(db, { id: b.id, userId: 9, decision: 'maybe' })).rejects.toMatchObject({ statusCode: 422 });
});

test('agents may only call built-in or pinned cards, never themselves', async () => {
  const agent = { ...base, requester: { kind: 'agent', id: 'atlas' }, autonomous: true, createRun: createAgentCardRun };
  await expect(createHelpRequest(fakeDb(), { ...agent, cardId: 'ext:n8n:mine', task: 'x' }))
    .rejects.toMatchObject({ statusCode: 403, code: 'AGENT_HELP_PIN_REQUIRED' });
  const pinned = await createHelpRequest(fakeDb({ installed: ['ext:n8n:mine'] }), { ...agent, cardId: 'ext:n8n:mine', task: 'x' });
  expect(pinned.requester).toEqual({ kind: 'agent', id: 'atlas' });
  expect(createAgentCardRun.mock.calls[0][0].payload.prompt).toContain('From: agent "atlas"');
  await expect(createHelpRequest(fakeDb(), { ...agent, requester: { kind: 'agent', id: 'nexus' }, cardId: 'agent:nexus', task: 'x' }))
    .rejects.toMatchObject({ code: 'AGENT_HELP_SELF' });
});

test('a person filing on behalf of an agent is not held to the autonomous pin rule', async () => {
  const filed = await createHelpRequest(fakeDb(), {
    ...base, requester: { kind: 'agent', id: 'echo' }, cardId: 'ext:n8n:mine', task: 'x', createRun: createAgentCardRun,
  });
  expect(filed.requester).toEqual({ kind: 'agent', id: 'echo' });
  expect(createAgentCardRun).toHaveBeenCalledTimes(1);
});

test('invalid targets and inputs fail with stable codes before anything is stored', async () => {
  const db = fakeDb();
  const cases = [
    [{ cardId: 'ext:none', task: 'x' }, 'AGENT_HELP_TARGET_NOT_FOUND'],
    [{ cardId: 'ext:7:descriptive', task: 'x' }, 'AGENT_HELP_NOT_CALLABLE'],
    [{ cardId: 'ext:9:closed', task: 'x' }, 'AGENT_HELP_NOT_ACCEPTED'],
    [{ cardId: 'agent:nexus', task: '   ' }, 'AGENT_HELP_TASK_REQUIRED'],
    [{ cardId: 'agent:nexus', task: 'x'.repeat(8001) }, 'AGENT_HELP_TASK_TOO_LARGE'],
    [{ cardId: 'agent:nexus', task: 'x', skillId: 'nope' }, 'AGENT_HELP_SKILL_UNKNOWN'],
  ];
  for (const [input, code] of cases) {
    await expect(createHelpRequest(db, { ...base, ...input })).rejects.toMatchObject({ code });
  }
  expect(db.rows.size).toBe(0);
});

test('a failed dispatch is recorded as failed instead of throwing', async () => {
  const db = fakeDb();
  createAgentCardRun.mockRejectedValueOnce(new Error('queue down'));
  const result = await createHelpRequest(db, { ...base, cardId: 'agent:nexus', task: 'x', createRun: createAgentCardRun });
  expect(result).toMatchObject({ status: 'failed', error: 'queue down' });
});

test('composeHelpPrompt names the requester without leaking ids for people', () => {
  expect(composeHelpPrompt({ task: 'T', skill: null, requester: { kind: 'user', id: '7' } }))
    .toBe('[Help request via the Censai agent network]\nFrom: a workspace member\n\nTask:\nT\n\nReply with the finished result for the requester.');
});
