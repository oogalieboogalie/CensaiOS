// server/shareLinks/commentRows.js
//
// Postgres rows for canvas comment pins (canvas_comments). store.js
// re-exports these so callers keep one import for share-link data.

const COMMENT_COLUMNS = `id, workspace_id, thread_id, link_id, author_kind, author_id, author_name,
  author_color, body, x, y, window_id, mentions, resolved_at, resolved_by, created_at`;

export async function listComments(db, { workspaceId }) {
  const { rows } = await db.query(
    `SELECT ${COMMENT_COLUMNS} FROM canvas_comments WHERE workspace_id = $1
      ORDER BY created_at ASC LIMIT 2000`,
    [workspaceId],
  );
  return rows;
}

export async function getComment(db, { workspaceId, commentId }) {
  const { rows } = await db.query(
    `SELECT ${COMMENT_COLUMNS} FROM canvas_comments WHERE workspace_id = $1 AND id::text = $2`,
    [workspaceId, String(commentId)],
  );
  return rows[0] || null;
}

export async function insertComment(db, comment) {
  const { rows } = await db.query(
    `INSERT INTO canvas_comments (workspace_id, thread_id, link_id, author_kind, author_id, author_name,
       author_color, body, x, y, window_id, mentions)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
     RETURNING ${COMMENT_COLUMNS}`,
    [comment.workspaceId, comment.threadId || null, comment.linkId || null, comment.authorKind,
      comment.authorId, comment.authorName, comment.authorColor || null, comment.body,
      comment.x ?? null, comment.y ?? null, comment.windowId || null, JSON.stringify(comment.mentions || [])],
  );
  return rows[0];
}

export async function setCommentResolved(db, { workspaceId, commentId, resolved, by }) {
  const { rows } = await db.query(
    `UPDATE canvas_comments
        SET resolved_at = CASE WHEN $3 THEN COALESCE(resolved_at, NOW()) ELSE NULL END,
            resolved_by = CASE WHEN $3 THEN $4 ELSE NULL END
      WHERE workspace_id = $1 AND id::text = $2 AND thread_id IS NULL
      RETURNING ${COMMENT_COLUMNS}`,
    [workspaceId, String(commentId), Boolean(resolved), by || null],
  );
  return rows[0] || null;
}

export function publicComment(row) {
  if (!row) return null;
  return {
    id: row.id,
    threadId: row.thread_id,
    author: { kind: row.author_kind, id: row.author_id, name: row.author_name, color: row.author_color },
    body: row.body,
    x: row.x,
    y: row.y,
    windowId: row.window_id,
    mentions: Array.isArray(row.mentions) ? row.mentions : [],
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    createdAt: row.created_at,
  };
}
