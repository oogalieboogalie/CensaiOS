/** Share links that still open a board: not revoked and not past their expiry. */
export async function countActiveShareLinks(db) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM share_links
      WHERE revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())`,
  );
  return Number(rows[0]?.n || 0);
}
