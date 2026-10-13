import { createLogger } from '../logger.js';
import { createWorkspaceEvent } from '../operational-intelligence/factories.js';
import { deriveCollaborationEpisodes } from './episodePolicy.js';

const log = createLogger('collaboration-memory');
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 24;

function eventActor(actor) {
  const sourceKind = actor?.kind || actor?.type;
  const kind = sourceKind === 'human' ? 'user' : sourceKind;
  return {
    kind: ['user', 'agent', 'system'].includes(kind) ? kind : 'system',
    id: String(actor?.id || 'unknown'),
  };
}

function boundedLimit(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(MAX_LIMIT, Math.max(1, parsed)) : DEFAULT_LIMIT;
}

export async function persistCollaborationEpisodes(db, input) {
  const episodes = deriveCollaborationEpisodes(input.previousValue, input.nextValue, input);
  if (episodes.length === 0) return [];
  const client = typeof db.connect === 'function' ? await db.connect() : null;
  const target = client || db;
  try {
    if (client) await client.query('BEGIN');
    for (const episode of episodes) {
      await createWorkspaceEvent({ db: target }, {
        workspaceId: input.workspaceId,
        type: episode.eventType,
        actor: eventActor(input.actor),
        payload: episode,
      });
    }
    if (client) await client.query('COMMIT');
    return episodes;
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client?.release();
  }
}

export async function persistCollaborationEpisodesSafely(db, input) {
  try {
    return await persistCollaborationEpisodes(db, input);
  } catch (error) {
    log.warn('episode recording skipped', {
      workspaceId: input.workspaceId,
      revision: input.revision,
      error: error.message,
    });
    return [];
  }
}

export async function listRecentCollaborationEpisodes(db, { workspaceId, limit } = {}) {
  const { rows } = await db.query(
    `SELECT event_type,actor_kind,actor_id,payload,created_at
       FROM workspace_events
      WHERE workspace_id=$1 AND event_type LIKE 'collaboration.window.%'
      ORDER BY CASE WHEN payload->>'revision' ~ '^[0-9]+$'
                    THEN (payload->>'revision')::bigint ELSE 0 END DESC,
               created_at DESC
      LIMIT $2`,
    [workspaceId, boundedLimit(limit)]
  );
  return rows.map(row => ({
    ...(row.payload || {}),
    eventType: row.event_type,
    actor: { kind: row.actor_kind, id: row.actor_id },
    createdAt: row.created_at,
  }));
}

export async function listRecentCollaborationEpisodesSafely(db, input) {
  try {
    return await listRecentCollaborationEpisodes(db, input);
  } catch (error) {
    log.warn('episode recall skipped', { workspaceId: input?.workspaceId, error: error.message });
    return [];
  }
}
