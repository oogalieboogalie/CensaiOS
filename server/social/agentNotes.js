// server/social/agentNotes.js
//
// "Atlas worked on Launch board: searched the web, opened a window". When an agent run
// finishes on a board someone shows on their profile, one line goes into
// that person's feed. Nothing of the conversation is kept: only the agent's
// name, the board and which tools it used. Runs on boards nobody shows off
// leave no trace here. A busy agent gets one line per board every ten
// minutes, refreshed, not a line per turn.

import pool from '../db.js';
import { createLogger } from '../logger.js';
import { forgetPublicFeed } from './publicFeed.js';

const log = createLogger('social');
export const AGENT_NOTE_WINDOW_MS = 10 * 60 * 1000;
const PRIVATE_TOOL = /journal|secret|key|password|credential|private/i;

// Plain words for the tools people see agents use most.
const PLAIN = Object.freeze({
  canvas_spawn_window: 'opened a window', canvas_append_window: 'wrote in a window', project_preview: 'made a preview',
  web_search: 'searched the web', remember: 'saved a memory', canvas_window_index: 'looked around the board', read_module: 'read a module', use_module: 'used a module',
});

function words(tool) {
  if (PLAIN[tool]) return PLAIN[tool];
  return String(tool || '').replace(/^mcp__[^_]+__/, '').replace(/[_-]+/g, ' ').trim().toLowerCase();
}

/** "searched the web, opened a window and 2 more", or "" when no shareable tool ran. */
export function describeTools(toolActions = []) {
  const names = [...new Set((toolActions || []).map((action) => action?.tool).filter((tool) => tool && !PRIVATE_TOOL.test(tool)).map(words))];
  if (!names.length) return '';
  const shown = names.slice(0, 3);
  if (names.length > 3) return `${shown.join(', ')} and ${names.length - 3} more`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}` : shown[0];
}

/** Record one agent run on a shown board. Never throws. */
export async function noteAgentWork({ workspaceId, agentId, agentName, toolActions = [], db = pool, now = Date.now() } = {}) {
  if (!workspaceId || !agentId) return false;
  try {
    const shown = (await db.query(
      'SELECT user_id, title FROM social_showcase WHERE workspace_id = $1 ORDER BY created_at LIMIT 1',
      [String(workspaceId)],
    )).rows[0];
    if (!shown) return false;
    const tools = describeTools(toolActions);
    const name = String(agentName || agentId).slice(0, 60);
    const body = tools ? `worked on ${shown.title}: ${tools}` : `answered a question on ${shown.title}`;
    const recent = (await db.query(
      `SELECT id FROM social_posts WHERE kind = 'agent' AND workspace_id = $1 AND agent_id = $2
          AND created_at > $3 ORDER BY created_at DESC LIMIT 1`,
      [String(workspaceId), String(agentId), new Date(now - AGENT_NOTE_WINDOW_MS)],
    )).rows[0];
    if (recent) {
      await db.query('UPDATE social_posts SET body = $2, created_at = NOW() WHERE id = $1', [recent.id, body]);
    } else {
      await db.query(
        `INSERT INTO social_posts (user_id, workspace_id, kind, agent_id, agent_name, body)
         VALUES ($1, $2, 'agent', $3, $4, $5)`,
        [shown.user_id, String(workspaceId), String(agentId), name, body],
      );
    }
    forgetPublicFeed(shown.user_id);
    return true;
  } catch (error) {
    log.warn('agent feed note skipped', { workspaceId, error: error.message });
    return false;
  }
}
