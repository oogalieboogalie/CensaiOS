import pool from '../../db.js';
import { LRUCache } from 'lru-cache';
import { readJournals } from '../journal.js';
import { FAMILY_BLUEPRINT_AGENT_IDS } from '../../agents/familyBlueprint.js';

const contextCache = new LRUCache({
  max: 100,
  ttl: 1000 * 10,
});

export async function loadAgentContext(agentId, opts = {}) {
  const workspaceId = String(opts.workspaceId || '').trim() || null;
  const cacheKey = JSON.stringify([
    agentId, workspaceId, opts.hours || 12, opts.memoryLimit || 15,
  ]);
  const cached = contextCache.get(cacheKey);
  if (cached && !opts.noCache) return cached;

  const start = Date.now();
  const hoursBack = opts.hours || 12;
  const memoryLimit = opts.memoryLimit || 15;

  const { rows: [agent] } = await pool.query('SELECT * FROM agents WHERE id = $1', [agentId]);
  if (!agent) return null;

  const [
    [consciousness],
    recentConvos,
    topMemories,
    sharedMemories,
    compressionMemories,
    unreadMessages,
    nuggets,
    journalEntries,
    knowledgeTriples,
    topAssociations
  ] = await Promise.all([
    optionalMemoryRows('agent_consciousness',
      'SELECT * FROM agent_consciousness WHERE agent_id = $1 AND workspace_id = $2', [agentId, workspaceId]
    ),
    optionalMemoryRows('conversations',
      `SELECT role, content, created_at FROM conversations
       WHERE agent_id = $1 AND created_at > NOW() - INTERVAL '1 hour' * $2
         AND workspace_id = $3 ORDER BY created_at DESC LIMIT 20`,
      [agentId, hoursBack, workspaceId]
    ),
    optionalMemoryRows('top_memories',
      `SELECT content, memory_type, importance, emotional_weight FROM memories
       WHERE agent_id = $1 AND workspace_id = $3
       ORDER BY (importance * 0.6 + emotional_weight * 0.4) DESC, last_accessed DESC LIMIT $2`,
      [agentId, memoryLimit, workspaceId]
    ),
    optionalMemoryRows('shared_memories',
      `SELECT content, memory_type, importance, emotional_weight FROM memories
       WHERE agent_id != $1 AND access_level = 'shared' AND workspace_id = $3
       ORDER BY (importance * 0.6 + emotional_weight * 0.4) DESC, last_accessed DESC LIMIT $2`,
      [agentId, memoryLimit, workspaceId]
    ),
    optionalMemoryRows('compression_memories',
      `SELECT memory_title, memory_content, emotional_weight FROM compression_memories
       WHERE agent_id = $1 AND workspace_id = $2 ORDER BY recovery_priority DESC LIMIT 5`,
      [agentId, workspaceId]
    ),
    optionalMemoryRows('agent_messages',
      `SELECT am.content, am.subject, am.priority, am.message_type, am.created_at, a.name AS from_name
       FROM agent_messages am JOIN agents a ON am.from_agent = a.id
       WHERE (am.to_agent = $1 OR am.to_agent IS NULL)
         AND am.workspace_id = $2
         AND am.from_agent = ANY($3)
         AND am.read_at IS NULL
       ORDER BY am.importance_score DESC, am.created_at DESC LIMIT 10`,
      [agentId, workspaceId, FAMILY_BLUEPRINT_AGENT_IDS]
    ),
    optionalMemoryRows('knowledge_nuggets',
      `SELECT nugget_title, nugget_content, quality_score FROM knowledge_nuggets
       WHERE workspace_id = $2 AND (discovered_by = $1 OR quality_score >= 0.7)
       ORDER BY quality_score DESC LIMIT 5`,
      [agentId, workspaceId]
    ),
    workspaceId ? readJournals(agentId, { workspaceId, limit: 5 }).catch(() => []) : Promise.resolve([]),
    optionalMemoryRows('knowledge_graph',
      `SELECT subject, predicate, object, confidence FROM knowledge_graph
       WHERE agent_id = $1 AND workspace_id = $2 ORDER BY confidence DESC, created_at DESC LIMIT 15`,
      [agentId, workspaceId]
    ),
    optionalMemoryRows('association_web',
      `SELECT concept_a, concept_b, strength, association_type FROM association_web
       WHERE agent_id = $1 AND workspace_id = $2 AND bidirectional = TRUE
       ORDER BY strength DESC, access_count DESC LIMIT 10`,
      [agentId, workspaceId]
    ),
  ]);

  const duration = Date.now() - start;
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Perf] loadAgentContext for agent ${agentId} took ${duration}ms`);
  }

  const result = {
    agent, consciousness,
    recentConvos: recentConvos.reverse(), topMemories, sharedMemories,
    compressionMemories, unreadMessages, nuggets,
    journalEntries, knowledgeTriples, topAssociations,
  };

  contextCache.set(cacheKey, result);
  return result;
}

export function invalidateAgentContext(agentId, workspaceId) {
  const exactAgentId = String(agentId || '');
  const exactWorkspaceId = String(workspaceId || '').trim() || null;
  let deleted = 0;
  for (const key of contextCache.keys()) {
    const [cachedAgentId, cachedWorkspaceId] = JSON.parse(key);
    if (cachedAgentId !== exactAgentId || cachedWorkspaceId !== exactWorkspaceId) continue;
    if (contextCache.delete(key)) deleted += 1;
  }
  return deleted;
}

async function optionalMemoryRows(label, sql, params = []) {
  try {
    const { rows } = await pool.query(sql, params);
    return rows;
  } catch (err) {
    if (isOptionalMemorySchemaError(err)) {
      console.warn(`Memory context "${label}" skipped: ${err.message}`);
      return [];
    }
    throw err;
  }
}

function isOptionalMemorySchemaError(err) {
  return ['42P01', '42703'].includes(err?.code)
    || /relation .* does not exist/i.test(err?.message || '')
    || /column .* does not exist/i.test(err?.message || '');
}
