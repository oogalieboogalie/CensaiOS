import { createHandoff, loadArtifactCausality } from '../server/operational-intelligence/handoffs.js';

function dbWithResponses(responses) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next || { rows: [] };
    },
  };
}

describe('operational intelligence handoffs', () => {
  test('createHandoff writes artifact, relationships, and handoff.created event', async () => {
    const db = dbWithResponses([
      { rows: [{ id: 'source-1', workspace_id: 'workspace-1' }] },
      { rows: [{ id: 'agent-1', workspace_id: 'workspace-1' }] },
      { rows: [{ id: 'handoff-1', workspace_id: 'workspace-1', artifact_type: 'handoff', title: 'Ship it' }] },
      { rows: [{ id: 'artifact-event-1', event_type: 'artifact.created' }] },
      { rows: [{ id: 'rel-origin', relationship_type: 'originated_from' }] },
      { rows: [{ id: 'relationship-event-1', event_type: 'relationship.created' }] },
      { rows: [] },
      { rows: [{ id: 'rel-assigned', relationship_type: 'assigned_to' }] },
      { rows: [{ id: 'relationship-event-2', event_type: 'relationship.created' }] },
      { rows: [] },
      { rows: [{ id: 'handoff-event-1', event_type: 'handoff.created' }] },
    ]);

    const result = await createHandoff({ db }, {
      workspaceId: 'workspace-1',
      owner: { kind: 'system', id: 'guardian' },
      title: 'Ship it',
      description: 'Ship it',
      assigneeArtifactId: 'agent-1',
      sourceArtifactId: 'source-1',
      acceptance: ['npm test -- tests/operationalHandoffs.test.js'],
      outputs: ['PR only'],
    });

    expect(result.handoff.id).toBe('handoff-1');
    expect(result.relationships.map(rel => rel.id)).toEqual(['rel-origin', 'rel-assigned']);
    expect(result.event.id).toBe('handoff-event-1');
    expect(db.calls[2].sql).toContain('INSERT INTO artifacts');
    expect(db.calls[4].params[3]).toBe('originated_from');
    expect(db.calls[7].params[3]).toBe('assigned_to');
    expect(db.calls[10].params[1]).toBe('handoff.created');
    expect(db.calls[10].params[8]).toContain('"relationshipIds":["rel-origin","rel-assigned"]');
  });

  test('createHandoff rejects cross-workspace references', async () => {
    const db = dbWithResponses([
      { rows: [{ id: 'source-1', workspace_id: 'workspace-2' }] },
    ]);

    await expect(createHandoff({ db }, {
      workspaceId: 'workspace-1',
      title: 'Ship it',
      description: 'Ship it',
      assigneeArtifactId: 'agent-1',
      sourceArtifactId: 'source-1',
      acceptance: ['npm test'],
    })).rejects.toThrow('Source artifact not found');
  });

  test('loadArtifactCausality returns one-hop links and chronological events', async () => {
    const db = dbWithResponses([
      { rows: [{ id: 'handoff-1', workspace_id: 'workspace-1', artifact_type: 'handoff', title: 'Ship it' }] },
      {
        rows: [{
          relationship_id: 'rel-up',
          relationship_workspace_id: 'workspace-1',
          source_artifact_id: 'upstream-1',
          target_artifact_id: 'handoff-1',
          relationship_type: 'generated_by',
          relationship_strength: 1,
          relationship_metadata: {},
          created_by_event_id: 'event-up',
          relationship_created_at: '2026-06-19T00:00:00.000Z',
          relationship_ended_at: null,
          artifact_id: 'upstream-1',
          artifact_workspace_id: 'workspace-1',
          owner_kind: 'agent',
          owner_id: 'atlas',
          visibility: 'workspace',
          artifact_type: 'task',
          title: 'Source task',
          status: 'active',
          data: { text: 'Source task' },
          metadata: {},
          source_ref: {},
          artifact_created_at: '2026-06-19T00:00:00.000Z',
          updated_at: '2026-06-19T00:00:00.000Z',
          deleted_at: null,
        }],
      },
      {
        rows: [{
          relationship_id: 'rel-down',
          relationship_workspace_id: 'workspace-1',
          source_artifact_id: 'handoff-1',
          target_artifact_id: 'agent-1',
          relationship_type: 'assigned_to',
          relationship_strength: 1,
          relationship_metadata: {},
          created_by_event_id: 'event-down',
          relationship_created_at: '2026-06-19T00:01:00.000Z',
          relationship_ended_at: null,
          artifact_id: 'agent-1',
          artifact_workspace_id: 'workspace-1',
          owner_kind: 'system',
          owner_id: 'guardian',
          visibility: 'workspace',
          artifact_type: 'agent',
          title: 'architect',
          status: 'active',
          data: { agentId: 'architect' },
          metadata: {},
          source_ref: {},
          artifact_created_at: '2026-06-19T00:01:00.000Z',
          updated_at: '2026-06-19T00:01:00.000Z',
          deleted_at: null,
        }],
      },
      {
        rows: [
          { id: 'event-1', event_type: 'artifact.created', created_at: '2026-06-19T00:00:00.000Z' },
          { id: 'event-2', event_type: 'handoff.created', created_at: '2026-06-19T00:02:00.000Z' },
        ],
      },
    ]);

    const result = await loadArtifactCausality({ db }, {
      workspaceId: 'workspace-1',
      artifactId: 'handoff-1',
      limit: 5,
    });

    expect(result.artifact.id).toBe('handoff-1');
    expect(result.upstream[0]).toEqual(expect.objectContaining({
      relationship: expect.objectContaining({ id: 'rel-up', relationship_type: 'generated_by' }),
      artifact: expect.objectContaining({ id: 'upstream-1', artifact_type: 'task' }),
    }));
    expect(result.downstream[0]).toEqual(expect.objectContaining({
      relationship: expect.objectContaining({ id: 'rel-down', relationship_type: 'assigned_to' }),
      artifact: expect.objectContaining({ id: 'agent-1', artifact_type: 'agent' }),
    }));
    expect(result.events.map(event => event.id)).toEqual(['event-1', 'event-2']);
    expect(db.calls[1].params).toEqual([
      'handoff-1', 'workspace-1', expect.any(Array), 5,
    ]);
    expect(db.calls[2].params).toEqual([
      'handoff-1', 'workspace-1', expect.any(Array), 5,
    ]);
  });
});
