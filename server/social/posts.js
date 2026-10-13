// server/social/posts.js
//
// "Share what you're building": a short post, optionally about one of the
// boards on your profile. Posts about other boards would point followers at
// something they cannot see, so only shown boards can be named.

import { SocialError } from './keys.js';

export const MAX_POST_CHARS = 500;

export async function createPost(db, userId, { body, boardId } = {}) {
  const text = String(body ?? '').trim().slice(0, MAX_POST_CHARS);
  if (!text) throw new SocialError('Write something to post.');
  let workspaceId = null;
  if (boardId) {
    const shown = (await db.query(
      'SELECT workspace_id FROM social_showcase WHERE id::text = $1 AND user_id = $2', [String(boardId), userId],
    )).rows[0];
    if (!shown) throw new SocialError('Pick a board from your profile.', 404, 'SOCIAL_NO_BOARD');
    workspaceId = shown.workspace_id;
  }
  const { rows } = await db.query(
    `INSERT INTO social_posts (user_id, workspace_id, kind, body) VALUES ($1, $2, 'post', $3)
     RETURNING id, created_at`,
    [userId, workspaceId, text],
  );
  return { id: rows[0].id, at: rows[0].created_at };
}

export async function deletePost(db, userId, postId) {
  const { rowCount } = await db.query(
    "DELETE FROM social_posts WHERE user_id = $1 AND id::text = $2 AND kind = 'post'", [userId, String(postId)],
  );
  return rowCount > 0;
}
