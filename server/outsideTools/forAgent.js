// server/outsideTools/forAgent.js
//
// The outside tools one agent may use in one run: definitions to add to the
// model's tool list, and a call function the run engine routes them to.
// Built from the cached tool lists (no network until a tool is used), so an
// unreachable server never slows a plain chat down. Every call is logged.

import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { callServerTool } from './connections.js';
import { readSecret, recordCall, serversForAgent } from './store.js';
import { toolDefinitions } from './toolNames.js';

const log = createLogger('outside-tools');
const MAX_TOOLS_PER_RUN = 60;

export const EMPTY_OUTSIDE_TOOLS = Object.freeze({
  definitions: [], has: () => false, call: async () => 'No outside tool by that name.',
});

/** Strip the chat loop's private bookkeeping (__provenance and friends). */
export function outsideArgs(args) {
  const out = {};
  for (const [key, value] of Object.entries(args || {})) {
    if (!key.startsWith('__')) out[key] = value;
  }
  return out;
}

export async function loadOutsideTools({ db, userId, agentId, origin = 'chat' }) {
  if (!db || !userId || !agentId) return EMPTY_OUTSIDE_TOOLS;
  let servers;
  try {
    servers = await serversForAgent(db, { userId, agentId });
  } catch (error) {
    // The table may not exist yet on an older database; chat carries on.
    log.warn('outside tools unavailable', { code: safeErrorCode(error) });
    return EMPTY_OUTSIDE_TOOLS;
  }
  const byName = new Map();
  const definitions = [];
  for (const server of servers) {
    for (const tool of toolDefinitions(server)) {
      if (definitions.length >= MAX_TOOLS_PER_RUN || byName.has(tool.name)) continue;
      byName.set(tool.name, { server, realName: tool.realName });
      definitions.push(tool.definition);
    }
  }
  if (!definitions.length) return EMPTY_OUTSIDE_TOOLS;

  return {
    definitions,
    has: (name) => byName.has(name),
    async call(name, args) {
      const entry = byName.get(name);
      if (!entry) return 'No outside tool by that name.';
      const startedAt = Date.now();
      let text = '';
      let error = null;
      try {
        const secret = await readSecret(db, { userId, server: entry.server });
        text = await callServerTool(entry.server, secret, entry.realName, outsideArgs(args));
      } catch (err) {
        error = err;
      }
      recordCall(db, {
        serverId: entry.server.id, userId, agentId, tool: entry.realName, origin,
        ok: !error, durationMs: Date.now() - startedAt, resultChars: text.length, error: error?.message,
      }).catch((err) => log.warn('outside tool call not logged', { code: safeErrorCode(err) }));
      if (error) return `Error: ${entry.server.name} (outside tool) — ${error.message}`;
      return text;
    },
  };
}
