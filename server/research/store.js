// RESEARCH KNOWLEDGE BASE — Postgres storage, one knowledge base per board.

import pool from '../db.js';

const MAX_CHUNKS_SCANNED = 6000;

function sourceRow(row) {
  return {
    id: row.id,
    url: row.url || null,
    title: row.title,
    query: row.query || null,
    publishedAt: row.published_at || null,
    embedModel: row.embed_model || null,
    chunkCount: Number(row.chunk_count) || 0,
    charCount: Number(row.char_count) || 0,
    tags: Array.isArray(row.tags) ? row.tags : [],
    kind: row.kind || (row.url && !String(row.url).startsWith('file:') ? 'web' : null),
    savedAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export async function listSources(workspaceId, db = pool) {
  const { rows } = await db.query(
    `SELECT id, url, title, query, published_at, embed_model, chunk_count, char_count, tags, kind, created_at
       FROM research_sources WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 500`,
    [workspaceId],
  );
  return rows.map(sourceRow);
}

/**
 * Store one page and its chunks. Saving the same url again replaces it, so a
 * re-save refreshes the text instead of doubling it.
 */
export async function saveSource(scope, { url, title, query, publishedAt, embedModel, chunks, tags = null, kind = null }, db = pool) {
  const client = db.connect ? await db.connect() : db;
  try {
    await client.query('BEGIN');
    if (url) await client.query('DELETE FROM research_sources WHERE workspace_id = $1 AND url = $2', [scope.workspaceId, url]);
    const { rows } = await client.query(
      `INSERT INTO research_sources (workspace_id, saved_by_user_id, url, title, query, published_at, embed_model, chunk_count, char_count, tags, kind)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, url, title, query, published_at, embed_model, chunk_count, char_count, tags, kind, created_at`,
      [scope.workspaceId, scope.userId || null, url || null, String(title || url || 'Untitled').slice(0, 300),
        query ? String(query).slice(0, 500) : null, publishedAt || null, embedModel || null,
        chunks.length, chunks.reduce((n, c) => n + c.text.length, 0), tags, kind],
    );
    const source = rows[0];
    for (let i = 0; i < chunks.length; i += 1) {
      await client.query(
        `INSERT INTO research_chunks (source_id, workspace_id, ord, text, embed_model, embedding, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [source.id, scope.workspaceId, i, chunks[i].text, chunks[i].embedding ? embedModel : null, chunks[i].embedding || null, chunks[i].tags || null],
      );
    }
    await client.query('COMMIT');
    return sourceRow(source);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release?.();
  }
}

export async function deleteSource(workspaceId, id, db = pool) {
  const { rowCount } = await db.query('DELETE FROM research_sources WHERE workspace_id = $1 AND id::text = $2', [workspaceId, String(id)]);
  return rowCount > 0;
}

/** Every chunk on the board, with its source, for ranking in memory. */
export async function loadChunks(workspaceId, db = pool) {
  const { rows } = await db.query(
    `SELECT c.id, c.source_id, c.ord, c.text, c.embed_model, c.embedding, c.tags, s.url, s.title, s.published_at
       FROM research_chunks c JOIN research_sources s ON s.id = c.source_id
      WHERE c.workspace_id = $1 ORDER BY s.created_at DESC, c.ord LIMIT $2`,
    [workspaceId, MAX_CHUNKS_SCANNED],
  );
  return rows.map((row) => ({
    id: String(row.id),
    sourceId: row.source_id,
    ord: row.ord,
    text: row.text,
    embedModel: row.embed_model || null,
    embedding: row.embedding || null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    url: row.url || null,
    title: row.title,
    publishedAt: row.published_at || null,
  }));
}

/** One source's pieces in order, with their tags (no vectors). */
export async function listChunks(workspaceId, sourceId, db = pool) {
  const { rows } = await db.query(
    `SELECT ord, text, tags FROM research_chunks
      WHERE workspace_id = $1 AND source_id::text = $2 ORDER BY ord LIMIT 200`,
    [workspaceId, String(sourceId)],
  );
  return rows.map((row) => ({ ord: row.ord, text: row.text, tags: Array.isArray(row.tags) ? row.tags : [] }));
}
