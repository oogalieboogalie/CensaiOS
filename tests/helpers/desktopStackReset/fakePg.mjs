import fs from 'node:fs';

const logFile = process.env.CENSAI_DESKTOP_QUERY_LOG;

function log(line) {
  if (logFile) fs.appendFileSync(logFile, String(line).replace(/\s+/g, ' ').trim() + '\n');
}

export class Client {
  constructor(opts = {}) {
    this.connectionString = opts.connectionString || '';
  }

  async connect() {}

  async end() {}

  async query(sql) {
    const text = typeof sql === 'string' ? sql : '';
    log(text);
    if (/\bdrop\s+database\b/i.test(text)) {
      // The query is already recorded. Stop here so startup does not apply
      // setup files and boot the server.
      const err = new Error('TEST_OBSERVED_DROP');
      err.code = 'TEST_OBSERVED_DROP';
      throw err;
    }
    const tables = Number(process.env.CENSAI_DESKTOP_TABLES ?? '0');
    const rows = Number(process.env.CENSAI_DESKTOP_ROWS ?? '0');
    if (/\bpg_class\b/i.test(text)) {
      const found = Array.from({ length: Math.max(0, tables) }, (_, i) => ({
        schema_name: 'public',
        table_name: `saved_${i}`,
        kind: 'r',
      }));
      return { rows: found, rowCount: found.length };
    }
    if (/^\s*select\s+1\b/i.test(text)) {
      if (rows <= 0) return { rows: [], rowCount: 0 };
      return { rows: [{ present: 1 }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }
}

export default { Client };
