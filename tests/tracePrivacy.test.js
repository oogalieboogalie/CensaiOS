import { jest } from '@jest/globals';
import {
  finalizeTrace,
  recordToolTrace,
  recordTraceFailure,
  recordTraceRound,
} from '../server/operational-intelligence/traces.js';
import {
  sanitizeTraceArtifact,
  sanitizeTraceEvent,
} from '../server/operational-intelligence/tracePrivacy.js';

function eventDb() {
  return { query: jest.fn().mockResolvedValue({ rows: [{ id: 'event-1' }] }) };
}

function storedPayload(db) {
  return JSON.parse(db.query.mock.calls[0][1][8]);
}

describe('trace privacy boundary', () => {
  test('private journal traces persist only explicit redaction metadata', async () => {
    const db = eventDb();
    const secret = 'journal-secret-never-store';

    await recordToolTrace({ db }, {
      workspaceId: 'workspace-1',
      traceId: 'trace-1',
      toolName: 'journal',
      args: { content: secret, __provenance: { prompt: secret } },
      result: `saved ${secret}`,
      summary: { path: secret },
      ms: 12,
      ok: true,
      round: 2,
    });

    expect(storedPayload(db)).toEqual({
      toolName: 'journal',
      ms: 12,
      ok: true,
      round: 2,
      private: true,
      arguments: '[redacted]',
      result: '[redacted]',
    });
    expect(JSON.stringify(db.query.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(db.query.mock.calls)).not.toContain('__provenance');
  });

  test('ordinary tool traces keep safe summary and result shape without values', async () => {
    const db = eventDb();
    const secret = 'result-secret-never-store';

    await recordToolTrace({ db }, {
      workspaceId: 'workspace-1',
      traceId: 'trace-1',
      toolName: 'project_write',
      args: { content: secret, __provenance: { prompt: secret } },
      result: secret,
      summary: { path: 'src/app.js', added: 4, target: secret },
      ms: 5,
      ok: true,
      round: 1,
    });

    expect(storedPayload(db)).toEqual({
      toolName: 'project_write',
      ms: 5,
      ok: true,
      round: 1,
      summary: { path: 'src/app.js', added: 4 },
      resultType: 'string',
      resultLength: secret.length,
    });
    expect(JSON.stringify(db.query.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(db.query.mock.calls)).not.toContain('__provenance');
  });

  test('round and failure records discard provider locations, messages, args, and stacks', async () => {
    const roundDb = eventDb();
    await recordTraceRound({ db: roundDb }, {
      workspaceId: 'workspace-1',
      traceId: 'trace-1',
      round: 3,
      messages: [{ role: 'user', content: 'raw prompt' }],
      toolsAvailable: [{ function: { name: 'journal' } }],
      modelConfig: { model: 'openrouter/free', baseUrl: 'https://secret.example/key' },
    });
    expect(storedPayload(roundDb)).toEqual({
      round: 3,
      messagesCount: 1,
      toolsAvailableCount: 1,
      modelConfig: { model: 'openrouter/free' },
    });

    const failureDb = eventDb();
    const error = new Error('password=never-store');
    error.stack = 'stack-never-store';
    await recordTraceFailure({ db: failureDb }, {
      workspaceId: 'workspace-1',
      traceId: 'trace-1',
      error,
      contextSnapshot: {
        toolName: 'project_write', round: 3, messagesCount: 4,
        args: { __provenance: { prompt: 'prompt-never-store' } },
      },
    });
    expect(storedPayload(failureDb)).toEqual({
      failure: 'Execution failed',
      ok: false,
      toolName: 'project_write',
      round: 3,
      messagesCount: 4,
    });
    expect(JSON.stringify(failureDb.query.mock.calls)).not.toMatch(/never-store|__provenance|stack/i);
  });

  test('finalization and legacy reads expose lengths instead of text', async () => {
    const db = eventDb();
    await finalizeTrace({ db }, {
      traceId: 'trace-1',
      status: 'success',
      finalText: 'assistant-secret',
      timings: { total_ms: 25, tool_calls: [{ result: 'secret' }] },
    });
    expect(db.query.mock.calls[0][0]).toContain("data - 'finalTextPreview'");
    expect(JSON.parse(db.query.mock.calls[0][1][2])).toEqual({
      status: 'success',
      finalTextLength: 16,
      timings: { total_ms: 25, tool_calls_count: 1 },
      endedAt: expect.any(String),
    });
    expect(JSON.stringify(db.query.mock.calls)).not.toContain('assistant-secret');

    const trace = sanitizeTraceArtifact({
      id: 'trace-1',
      data: { finalTextPreview: 'legacy-secret', initialContext: { prompt: 'raw', messagesCount: 2 } },
      metadata: { source: 'chat_api', token: 'secret' },
      source_ref: { prompt: 'raw' },
    });
    expect(trace.data).toEqual({ initialContext: { messagesCount: 2 }, finalTextLength: 13 });
    expect(JSON.stringify(trace)).not.toMatch(/legacy-secret|"prompt"|"token"|source_ref/);

    const legacyEvent = sanitizeTraceEvent({
      event_type: 'tool.invocation',
      payload: { toolName: 'read_journal', args: { query: 'secret' }, resultPreview: 'secret' },
    }, { strict: true });
    expect(legacyEvent.payload).toEqual({
      toolName: 'read_journal',
      ok: false,
      private: true,
      arguments: '[redacted]',
      result: '[redacted]',
    });
  });
});
