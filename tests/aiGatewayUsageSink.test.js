import { jest } from '@jest/globals';
import {
  createUsageWorkspaceEvent,
  usageEventPayload,
} from '../server/aiGateway/usageSink.js';

describe('AI Gateway durable usage sink', () => {
  test('skips durable append when workspace attribution is unavailable', async () => {
    const db = { query: jest.fn() };

    await expect(createUsageWorkspaceEvent({ db }, {
      record: { type: 'embedding', ok: true },
      attribution: { source: 'semantic-embedding' },
    })).resolves.toBeNull();

    expect(db.query).not.toHaveBeenCalled();
  });

  test('appends an attributed ai.usage.recorded workspace event', async () => {
    const db = {
      query: jest.fn(async () => ({
        rows: [{ id: 'event-1', event_type: 'ai.usage.recorded' }],
      })),
    };

    const event = await createUsageWorkspaceEvent({ db }, {
      record: {
        type: 'image_generation',
        ok: true,
        provider: 'google',
        model: 'imagen-4',
        ms: 80,
        prompts: 1,
        images: 2,
      },
      attribution: {
        workspaceId: 'workspace-1',
        actor: { kind: 'agent', id: 'genesis' },
        source: 'image-studio',
        artifactId: '00000000-0000-0000-0000-000000000001',
        correlationId: '00000000-0000-0000-0000-000000000002',
      },
    });

    expect(event.id).toBe('event-1');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workspace_events'),
      expect.arrayContaining([
        'workspace-1',
        'ai.usage.recorded',
        'agent',
        'genesis',
      ])
    );
    const params = db.query.mock.calls[0][1];
    expect(params[4]).toBe('00000000-0000-0000-0000-000000000001');
    expect(params[6]).toBe('00000000-0000-0000-0000-000000000002');
    expect(JSON.parse(params[8])).toEqual(expect.objectContaining({
      usageType: 'image_generation',
      requestCount: 1,
      resultCount: 2,
    }));
  });

  test('fails open when the workspace event ledger is unavailable', async () => {
    const sinkLog = { warn: jest.fn() };
    const db = {
      query: jest.fn(async () => {
        throw new Error('database offline');
      }),
    };

    await expect(createUsageWorkspaceEvent({ db, log: sinkLog }, {
      record: { type: 'chat_completion', ok: true },
      attribution: {
        workspaceId: 'workspace-1',
        actor: { kind: 'user', id: 'local-user' },
        source: 'chat-loop',
      },
    })).resolves.toBeNull();

    expect(sinkLog.warn).toHaveBeenCalledWith(
      'usage event append failed',
      expect.objectContaining({ error: 'database offline' })
    );
  });

  test('never carries prompt-like record fields into the event payload', () => {
    const payload = usageEventPayload({
      type: 'chat_completion',
      ok: true,
      messages: 1,
      prompt: 'do not persist',
      baseUrl: 'https://provider.example/v1',
      error: { name: 'UpstreamError', message: 'private provider body', status: 503 },
    }, { source: 'chat-loop' });

    expect(payload).toEqual({
      usageType: 'chat_completion',
      ok: true,
      source: 'chat-loop',
      requestCount: 1,
      resultCount: 1,
      error: {
        name: 'UpstreamError',
        message: 'Provider request failed (503)',
        status: 503,
      },
    });
    expect(JSON.stringify(payload)).not.toContain('private provider body');
  });
});
