// In-memory stand-in for the two Yjs tables (workspace_yjs_docs base row +
// workspace_yjs_updates log) and the workspace_client_state row, matched at
// the SQL-text level the way server/collab/yStore.js and yUpdateLog.js issue
// them. Yjs encode/decode stays real.
import { jest } from '@jest/globals';
import { YDOC_TABLE, YUPDATE_TABLE } from '../../server/collab/yStore.js';

export function yjsMemoryDb({ now = () => Date.now() } = {}) {
  let base = null;
  let rows = [];
  let seq = 0;
  let clientState = null;
  const db = {
    query: jest.fn(async (sql, params = []) => {
      if (sql.includes(`INSERT INTO ${YDOC_TABLE}`)) {
        const [workspaceId, yupdate, schemaVersion, compactedSeq] = params;
        if (base && Number(base.compacted_seq) > Number(compactedSeq)) return { rows: [], rowCount: 0 };
        base = { workspace_id: workspaceId, yupdate, schema_version: schemaVersion, compacted_seq: compactedSeq };
        return { rows: [{ compacted_seq: compactedSeq }], rowCount: 1 };
      }
      if (sql.includes(`FROM ${YDOC_TABLE}`)) return { rows: base ? [{ ...base }] : [] };
      if (sql.includes(`INSERT INTO ${YUPDATE_TABLE}`)) {
        seq += 1;
        rows.push({ seq, workspace_id: params[0], yupdate: params[1], actor: params[2], created_at: new Date(now()) });
        return { rows: [{ seq }], rowCount: 1 };
      }
      if (sql.includes(`FROM ${YUPDATE_TABLE}`) && sql.startsWith('SELECT')) {
        const [workspaceId, afterSeq] = params;
        return { rows: rows.filter((r) => r.workspace_id === workspaceId && r.seq > Number(afterSeq)) };
      }
      if (sql.startsWith(`DELETE FROM ${YUPDATE_TABLE}`)) {
        const [workspaceId, cutoff] = params;
        const before = rows.length;
        rows = rows.filter((r) => !(r.workspace_id === workspaceId && r.seq <= Number(cutoff)));
        return { rows: [], rowCount: before - rows.length };
      }
      if (sql.includes('INSERT INTO workspace_client_state')) {
        const patch = JSON.parse(params[2]);
        clientState = {
          value: { ...(clientState?.value || {}), ...patch },
          revision: (clientState?.revision ?? 0) + (clientState ? Number(params[3]) : 1),
        };
        return { rows: [{ ...clientState, updated_at: new Date(now()) }] };
      }
      if (sql.includes('FROM workspace_client_state')) {
        return { rows: clientState ? [{ ...clientState, updated_at: new Date(now()) }] : [] };
      }
      if (/CREATE TABLE|ALTER TABLE|CREATE INDEX|BEGIN/.test(sql)) return { rows: [] };
      throw new Error(`unexpected SQL: ${sql}`);
    }),
    base: () => base,
    setBase: (next) => { base = next; },
    rows: () => rows,
    clientState: () => clientState,
    setClientState: (next) => { clientState = next; },
  };
  return db;
}
