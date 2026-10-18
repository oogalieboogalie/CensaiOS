// server/agentMemory/tx.js
//
// Run `work` inside one database transaction (a pool gets its own client).

export async function inTransaction(db, work) {
  const client = typeof db.connect === 'function' ? await db.connect() : db;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    if (client !== db) client.release?.();
  }
}
