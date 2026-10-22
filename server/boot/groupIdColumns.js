// The group goals and milestones routes expect a UUID or a whole-number id
// (server/routes/agents/groupOwner.js). docker/004-sub-agents.sql makes them
// UUIDs; when an install's tables were made another way, the 'db-setup' log
// says so once at start, naming the table and column type only.

const TABLES = ['group_goals', 'group_milestones'];

/** Which group tables have an id column that is not a uuid, with its type. */
export async function nonUuidGroupIds(client) {
  const { rows } = await client.query(
    `SELECT table_name, data_type FROM information_schema.columns
      WHERE table_schema = current_schema() AND column_name = 'id' AND table_name = ANY($1)`,
    [TABLES],
  );
  return rows
    .filter((row) => row.data_type !== 'uuid')
    .map((row) => ({ table: row.table_name, type: row.data_type }))
    .sort((a, b) => a.table.localeCompare(b.table));
}

/** One 'db-setup' line when any group id column is not a uuid. Never throws. */
export async function noteGroupIdColumns(client, log) {
  const warn = (message, meta) => { try { (log?.warn || log?.info)?.call(log, message, meta); } catch { /* never block start */ } };
  try {
    const odd = await nonUuidGroupIds(client);
    if (odd.length) {
      warn('group goal ids are not uuid columns', { columns: odd.map((c) => `${c.table}.id ${c.type}`).join(', ') });
    }
    return odd;
  } catch (err) {
    warn('group goal id check skipped', { code: /^[A-Za-z0-9_]{1,20}$/.test(String(err?.code ?? '')) ? err.code : null });
    return null;
  }
}
