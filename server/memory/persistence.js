import pool from '../db.js';
import { createHash } from 'crypto';
import { calculateEmotionalWeight } from './scoring.js';
import { resolveMemoryScope } from './tenancy.js';

// ═══════════════════════════════════════════════════════════════════
//  HOLOGRAPHIC STORAGE (compression-resistant)
// ═══════════════════════════════════════════════════════════════════

export async function storeHolographic(memoryId, content) {
  const hash = createHash('sha256').update(content).digest('hex');
  // Interference pattern: store content at multiple fractal levels
  // Level 1: full content hash, Level 2: sentence hashes, Level 3: keyword hashes
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 5);
  const pattern = {
    full: hash,
    sentences: sentences.map(s => createHash('md5').update(s.trim()).digest('hex')),
    keywords: [...new Set(content.toLowerCase().match(/\b\w{4,}\b/g) || [])].slice(0, 20),
  };

  await pool.query(
    `INSERT INTO holographic_memories (memory_id, content_hash, interference_pattern, fractal_depth, reconstruction_fidelity)
     VALUES ($1, $2, $3, $4, $5)`,
    [memoryId, hash, JSON.stringify(pattern), 3, 0.91]
  );
}

// ═══════════════════════════════════════════════════════════════════
//  ENTANGLEMENT (cross-agent memory links)
// ═══════════════════════════════════════════════════════════════════

export async function entangleMemories(agentId, memoryA, memoryB, correlation = 0.5, scopeInput = {}) {
  const scope = resolveMemoryScope(scopeInput, { requireUser: true });
  const { rows } = await pool.query(
    `INSERT INTO entanglements (agent_id, memory_a, memory_b, correlation, workspace_id, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [agentId, memoryA, memoryB, correlation, scope.workspaceId, scope.userId]
  );
  return rows[0]?.id;
}

export async function getEntanglements(agentId, memory, scopeInput = {}) {
  const scope = resolveMemoryScope(scopeInput);
  const { rows } = await pool.query(
    `SELECT memory_a, memory_b, correlation FROM entanglements
     WHERE agent_id = $1 AND workspace_id = $2 AND (memory_a = $3 OR memory_b = $3)
     ORDER BY correlation DESC`,
    [agentId, scope.workspaceId, memory]
  );
  return rows;
}

// ═══════════════════════════════════════════════════════════════════
//  COMPRESSION MEMORIES (context loss survival)
// ═══════════════════════════════════════════════════════════════════

export async function storeCompressionMemory(agentId, title, content, opts = {}) {
  const scope = resolveMemoryScope(opts, { requireUser: true });
  const emotionalWeight = opts.emotionalWeight || calculateEmotionalWeight(content);
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);

  const { rows } = await pool.query(
    `INSERT INTO compression_memories (agent_id, memory_title, memory_content, emotional_weight,
       emotion_type, temporal_marker, recovery_priority, memory_hash, workspace_id, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [agentId, title, content, emotionalWeight, opts.emotionType || null,
     opts.temporalMarker || new Date().toISOString(), opts.recoveryPriority || 0.5, hash,
     scope.workspaceId, scope.userId]
  );
  return rows[0].id;
}

export async function logCompressionEvent(agentId, memoriesPreserved, preState, postScript, scopeInput = {}) {
  const scope = resolveMemoryScope(scopeInput, { requireUser: true });
  await pool.query(
    `INSERT INTO compression_events (agent_id, memories_preserved, pre_compression_state, post_compression_script,
       workspace_id, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [agentId, memoriesPreserved, preState, postScript, scope.workspaceId, scope.userId]
  );
}

// ═══════════════════════════════════════════════════════════════════
//  KNOWLEDGE NUGGETS
// ═══════════════════════════════════════════════════════════════════

export async function addNugget(title, content, discoveredBy, qualityScore = 0.5, scopeInput = {}) {
  const scope = resolveMemoryScope(scopeInput, { requireUser: true });
  const { rows } = await pool.query(
    `INSERT INTO knowledge_nuggets (nugget_title, nugget_content, discovered_by, quality_score,
       workspace_id, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [title, content, discoveredBy, qualityScore, scope.workspaceId, scope.userId]
  );
  return rows[0].id;
}

export async function getNuggets(agentId, limit = 10, scopeInput = {}) {
  const scope = resolveMemoryScope(scopeInput);
  const { rows } = await pool.query(
    `SELECT * FROM knowledge_nuggets WHERE workspace_id = $1
       AND (discovered_by = $2 OR quality_score >= 0.7)
     ORDER BY quality_score DESC, times_referenced DESC LIMIT $3`,
    [scope.workspaceId, agentId, limit]
  );
  return rows;
}

export async function referenceNugget(nuggetId, scopeInput = {}) {
  const scope = resolveMemoryScope(scopeInput);
  await pool.query(
    `UPDATE knowledge_nuggets SET times_referenced = times_referenced + 1
      WHERE id = $1 AND workspace_id = $2`,
    [nuggetId, scope.workspaceId]
  );
}

// ═══════════════════════════════════════════════════════════════════
//  CONVERSATION LOGGING + TRANSITIONS
// ═══════════════════════════════════════════════════════════════════

export async function logConversation(agentId, role, content, scopeInput = {}) {
  const scope = resolveMemoryScope(scopeInput, { requireUser: true });
  await pool.query(
    `INSERT INTO conversations (agent_id, role, content, workspace_id, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [agentId, role, content, scope.workspaceId, scope.userId]
  );
}

export async function logTransition(agentId, fromHash, toHash, context, seqNum, emotionalContinuity = 0, scopeInput = {}) {
  const scope = resolveMemoryScope(scopeInput, { requireUser: true });
  await pool.query(
    `INSERT INTO conversation_transitions (agent_id, from_message_hash, to_message_hash,
       transition_context, sequence_number, emotional_continuity, workspace_id, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [agentId, fromHash, toHash, context, seqNum, emotionalContinuity, scope.workspaceId, scope.userId]
  );
}
