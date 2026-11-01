// server/liveOps/agentPresence.js
//
// What the Agent list needs from the server that is not a window on the
// board: when each agent last chatted on this board and with whom, the
// background tasks its helpers are working on (the task worker), and the
// agents added from other places (another censaiOS, an A2A agent, an n8n
// chat) with their latest help request. Only times, names and short task
// titles; never what anyone typed in a chat.

import { deriveHelpStatus } from '../agent-registry/helpRequestStore.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ROWS = 200;
const TITLE_MAX = 120;

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function clip(text, max = TITLE_MAX) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** The last chat line per agent on this board in the past week, and who it was with. */
export async function lastChats(db, workspaceId, { now = Date.now() } = {}) {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (c.agent_id) c.agent_id, c.role, c.created_at,
            COALESCE(u.name, split_part(u.email, '@', 1)) AS with_name
       FROM conversations c
       LEFT JOIN users u ON u.id = c.created_by_user_id
      WHERE c.workspace_id = $1 AND c.created_at > $2
      ORDER BY c.agent_id, c.created_at DESC
      LIMIT $3`,
    [workspaceId, new Date(now - WEEK_MS), MAX_ROWS],
  );
  return rows.map((row) => ({
    agentId: row.agent_id,
    at: iso(row.created_at),
    lastSpeaker: row.role === 'user' ? 'person' : 'agent',
    withName: row.with_name || null,
  }));
}

/** Background tasks still going on this board, by the agent that handed them out. */
export async function openTasks(db, workspaceId) {
  const { rows } = await db.query(
    `SELECT t.id, t.parent_id, t.title, t.status, t.started_at, t.created_at, t.updated_at,
            s.name AS helper_name
       FROM agent_tasks t
       LEFT JOIN sub_agents s ON s.id = t.assignee_id
      WHERE t.workspace_id = $1 AND t.status IN ('in_progress', 'queued', 'blocked')
      ORDER BY t.created_at DESC
      LIMIT $2`,
    [workspaceId, MAX_ROWS],
  );
  return rows.map((row) => ({
    id: row.id,
    agentId: row.parent_id,
    title: clip(row.title),
    status: row.status,
    helper: row.helper_name || null,
    startedAt: iso(row.started_at),
    at: iso(row.updated_at) || iso(row.created_at),
  }));
}

const IMPORT_KIND = { censai: 'censai', a2a: 'a2a', n8n_chat: 'n8n' };

/** Agents added to this board from elsewhere, each with its latest help request. */
export async function networkAgents(db, workspaceId, { now = Date.now() } = {}) {
  const { rows } = await db.query(
    `SELECT c.id, c.name, c.metadata->'import'->>'kind' AS import_kind, c.created_at,
            h.status AS help_status, h.task AS help_task, h.updated_at AS help_at,
            r.status AS run_status, r.metadata->'relayCall' AS run_relay, r.completed_at AS run_completed_at
       FROM agent_cards c
       LEFT JOIN LATERAL (
         SELECT * FROM agent_help_requests x
          WHERE x.target_card_id = c.id AND x.workspace_id = $1 AND x.updated_at > $2
          ORDER BY x.updated_at DESC LIMIT 1
       ) h ON TRUE
       LEFT JOIN runs r ON r.id = h.run_id
      WHERE c.workspace_id = $1 AND c.deleted_at IS NULL
        AND c.metadata->'import'->>'kind' IS NOT NULL
      ORDER BY c.name
      LIMIT $3`,
    [workspaceId, new Date(now - DAY_MS), MAX_ROWS],
  );
  return rows.map((row) => ({
    cardId: row.id,
    name: clip(row.name, 80) || 'Shared agent',
    source: IMPORT_KIND[row.import_kind] || 'web',
    lastRequest: row.help_status ? {
      // A finished run counts as answered here; the receipt grace is for the help card.
      status: deriveHelpStatus({ ...row, status: row.help_status, receipt_row: true }),
      task: clip(row.help_task),
      at: iso(row.help_at),
    } : null,
  }));
}

/** Everything at once. A missing table never hides the rest. */
export async function collectAgentPresence(db, workspaceId, { now = Date.now() } = {}) {
  const errors = {};
  const safe = async (key, work) => {
    try {
      return await work();
    } catch (error) {
      errors[key] = error.code === '42P01' ? 'Not set up on this install' : 'Could not load';
      return [];
    }
  };
  const [chats, tasks, network] = await Promise.all([
    safe('chats', () => lastChats(db, workspaceId, { now })),
    safe('tasks', () => openTasks(db, workspaceId)),
    safe('network', () => networkAgents(db, workspaceId, { now })),
  ]);
  return { chats, tasks, network, errors, at: new Date(now).toISOString() };
}
