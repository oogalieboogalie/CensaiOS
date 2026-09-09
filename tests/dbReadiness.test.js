import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

jest.unstable_mockModule('../server/db.js', () => ({
  default: { query: jest.fn(), on: jest.fn() },
  createDbPool: jest.fn(),
}));

jest.unstable_mockModule('../server/memory/tasks.js', () => ({
  ensureAgentTaskReceiptSchema: jest.fn(async () => {}),
  requeueInProgressAgentTasks: jest.fn(async () => {}),
}));

jest.unstable_mockModule('../server/jules-task-sync/index.js', () => ({
  ensureJulesTaskSyncSchema: jest.fn(async () => {}),
}));

jest.unstable_mockModule('../server/boot/authSchema.js', () => ({
  ensureMultiUserSchema: jest.fn(async () => {}),
}));

jest.unstable_mockModule('../server/boot/capabilitySchema.js', () => ({
  ensureCapabilitySchema: jest.fn(async () => {}),
}));

jest.unstable_mockModule('../server/agent-registry/installSchema.js', () => ({
  ensureAgentCardInstallSchema: jest.fn(async () => {}),
}));

// The remaining probeDb schema ensures below are mocked for the same reason
// as the modules above: several read SQL files from disk with real fs, and
// real async I/O can stall inside jest.advanceTimersByTimeAsync, making retry
// probes hang and readiness stay false. These features (workspace/scheduler/
// autonomy/agent-card/sales-lead/memory/runs tenancy) landed after this
// file's mock block was written and were never added to it.
jest.unstable_mockModule('../server/policy/schema.js', () => ({
  ensurePolicySchema: jest.fn(async () => {}),
}));
jest.unstable_mockModule('../server/workspaces/schema.js', () => ({
  ensureWorkspaceSchema: jest.fn(async () => {}),
}));
jest.unstable_mockModule('../server/scheduler/schema.js', () => ({
  ensureScheduleTenancySchema: jest.fn(async () => {}),
}));
jest.unstable_mockModule('../server/autonomy/schema.js', () => ({
  ensureAutonomyTenancySchema: jest.fn(async () => {}),
}));
jest.unstable_mockModule('../server/agent-registry/tenancySchema.js', () => ({
  ensureAgentCardTenancySchema: jest.fn(async () => {}),
}));
jest.unstable_mockModule('../server/salesLeads/schema.js', () => ({
  ensureSalesLeadSchema: jest.fn(async () => {}),
}));
jest.unstable_mockModule('../server/memory/tenancySchema.js', () => ({
  ensureMemoryTenancySchema: jest.fn(async () => {}),
}));
jest.unstable_mockModule('../server/memory/subagentTenancySchema.js', () => ({
  ensureSubAgentTenancySchema: jest.fn(async () => {}),
}));
jest.unstable_mockModule('../server/runs/schema.js', () => ({
  ensureRunCausalitySchema: jest.fn(async () => {}),
}));

jest.unstable_mockModule('../server/boot/attributeSchema.js', () => ({
  ensureAttributeSchema: jest.fn(async () => {}),
}));

jest.unstable_mockModule('../server/boot/userApiKeySchema.js', () => ({
  ensureUserApiKeySchema: jest.fn(async () => {}),
}));

jest.unstable_mockModule('../server/agent-wakeups/schema.js', () => ({
  ensureAgentWakeupSchema: jest.fn(async () => {}),
}));

jest.unstable_mockModule('../server/secrets.js', () => ({
  initSecrets: jest.fn(async () => {}),
  getSecret: jest.fn(() => ''),
}));
jest.unstable_mockModule('../server/credentials/oauthStore.js', () => ({
  migrateLegacyOAuthCredentials: jest.fn(async () => 0),
}));

const noop = () => {};
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: () => ({ info: noop, warn: noop, error: noop, debug: noop, startTimer: () => () => 0 }),
}));

jest.unstable_mockModule('../server/task-worker/claim.js', () => ({
  claimTask: jest.fn(async () => null),
}));

jest.unstable_mockModule('../server/task-worker/execution.js', () => ({
  runTask: jest.fn(async () => {}),
}));

const { default: pool } = await import('../server/db.js');
const { checkDb, recheckDb, stopDbRetry } = await import('../server/boot/database.js');
const { dbReady, setDbReady } = await import('../server/dbState.js');
const { claimTask } = await import('../server/task-worker/claim.js');
const { startTaskWorker } = await import('../server/task-worker/poll.js');
const { state: workerState } = await import('../server/task-worker/shared.js');

describe('database readiness self-healing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    setDbReady(false);
  });

  afterEach(() => {
    stopDbRetry();
    jest.useRealTimers();
  });

  test('checkDb marks ready immediately when the database answers', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    await checkDb();
    expect(dbReady()).toBe(true);
    // Watcher attaches exactly once even across repeated boots. Asserted here
    // because the attach guard is module state and this test runs first.
    await checkDb();
    expect(pool.on).toHaveBeenCalledTimes(1);
    expect(pool.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  test('checkDb failure leaves not-ready, then a background retry flips ready when the DB comes back', async () => {
    pool.query.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:5433'));
    await checkDb();
    expect(dbReady()).toBe(false);

    // Database comes up before the first retry fires (5s after failure).
    pool.query.mockResolvedValue({ rows: [] });
    await jest.advanceTimersByTimeAsync(5000);
    expect(dbReady()).toBe(true);
  });

  test('keeps retrying through repeated failures until the DB returns', async () => {
    pool.query.mockRejectedValue(new Error('ECONNREFUSED'));
    await checkDb();

    // Burn through several failed retries (delays back off 5s → 15s cap).
    await jest.advanceTimersByTimeAsync(5000);   // attempt 1 fails
    await jest.advanceTimersByTimeAsync(10000);  // attempt 2 fails
    await jest.advanceTimersByTimeAsync(15000);  // attempt 3 fails
    expect(dbReady()).toBe(false);

    pool.query.mockResolvedValue({ rows: [] });
    await jest.advanceTimersByTimeAsync(15000);  // next attempt succeeds
    expect(dbReady()).toBe(true);
  });

  test('recheckDb drops readiness when a runtime probe fails, and recovery restores it', async () => {
    setDbReady(true);
    pool.query.mockRejectedValue(new Error('connection terminated'));
    await recheckDb('pool error');
    expect(dbReady()).toBe(false);

    pool.query.mockResolvedValue({ rows: [] });
    await jest.advanceTimersByTimeAsync(5000);
    expect(dbReady()).toBe(true);
  });

  test('recheckDb on a transient pool error keeps readiness when the probe succeeds', async () => {
    setDbReady(true);
    pool.query.mockResolvedValue({ rows: [] });
    await recheckDb('idle client error');
    expect(dbReady()).toBe(true);
  });

  test('task worker polls through a DB-down boot and activates when readiness returns', async () => {
    expect(dbReady()).toBe(false);
    startTaskWorker();
    expect(workerState.running).toBe(true);
    expect(workerState.disabledReason).toBe('database_unavailable');

    await jest.advanceTimersByTimeAsync(5000);
    expect(claimTask).not.toHaveBeenCalled();

    setDbReady(true);
    await jest.advanceTimersByTimeAsync(5000);
    expect(claimTask).toHaveBeenCalled();
    expect(workerState.disabledReason).toBeNull();
  });
});

describe('tenant_id migration (P1-3)', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  test('docker/027-tenant-id.sql adds tenant_id column to workspaces idempotently', async () => {
    const sqlPath = path.resolve(__dirname, '..', 'docker', '027-tenant-id.sql');
    const sql = await fs.promises.readFile(sqlPath, 'utf8');
    expect(sql).toMatch(/ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS tenant_id TEXT/i);
  });

  test('docker/027-tenant-id.sql creates an idempotent index on workspaces.tenant_id', async () => {
    const sqlPath = path.resolve(__dirname, '..', 'docker', '027-tenant-id.sql');
    const sql = await fs.promises.readFile(sqlPath, 'utf8');
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS\s+\S+\s+ON workspaces\s*\(tenant_id\)/i);
  });
});

describe('execution ledger migration', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  test('docker/026-execution-ledger.sql creates runs, run_steps, run_artifacts', async () => {
    const sqlPath = path.resolve(__dirname, '..', 'docker', '026-execution-ledger.sql');
    const sql = await fs.promises.readFile(sqlPath, 'utf8');
    for (const table of ['runs', 'run_steps', 'run_artifacts']) {
      const pattern = new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`);
      expect(sql).toMatch(pattern);
    }
  });

  test('run_steps has indexes on (run_id, sequence) and on run_id', async () => {
    const sqlPath = path.resolve(__dirname, '..', 'docker', '026-execution-ledger.sql');
    const sql = await fs.promises.readFile(sqlPath, 'utf8');
    expect(sql).toMatch(/run_steps\s*\(run_id,\s*sequence\)/i);
    expect(sql).toMatch(/run_steps\s*\(run_id\)/i);
  });

  test('run_artifacts has an index on run_id', async () => {
    const sqlPath = path.resolve(__dirname, '..', 'docker', '026-execution-ledger.sql');
    const sql = await fs.promises.readFile(sqlPath, 'utf8');
    expect(sql).toMatch(/run_artifacts\s*\(run_id\)/i);
  });

  test('every ledger table includes a tenant_id column for P1-3 alignment', async () => {
    const sqlPath = path.resolve(__dirname, '..', 'docker', '026-execution-ledger.sql');
    const sql = await fs.promises.readFile(sqlPath, 'utf8');
    for (const table of ['runs', 'run_steps', 'run_artifacts']) {
      const block = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b[\\s\\S]*?\\);`));
      expect(block).not.toBeNull();
      expect(block[0]).toMatch(/\btenant_id\b/);
    }
  });
});

describe('autonomous communication tenancy schema', () => {
  test('migration preserves the boot contract', async () => {
    const sql = await fs.promises.readFile(
      new URL('../docker/034-autonomy-tenancy.sql', import.meta.url), 'utf8'
    );
    for (const fragment of [
      'agent_messages_workspace_id_fkey', 'agent_messages_created_by_user_id_fkey',
      'agent_tasks_workspace_id_fkey', 'agent_tasks_created_by_user_id_fkey',
      'idx_agent_messages_owner_workspace', 'idx_agent_tasks_owner_workspace',
    ]) expect(sql).toContain(fragment);
  });

  test('task claims require complete ownership', async () => {
    const source = await fs.promises.readFile(
      new URL('../server/task-worker/claim.js', import.meta.url), 'utf8'
    );
    expect(source).toContain('workspace_id IS NOT NULL');
    expect(source).toContain('created_by_user_id IS NOT NULL');
  });
});

describe('agent memory tenancy schema', () => {
  test('migration scopes every mutable prompt-memory store and journal key', async () => {
    const sql = await fs.promises.readFile(
      new URL('../docker/036-memory-tenancy.sql', import.meta.url), 'utf8'
    );
    for (const table of [
      'memories', 'conversations', 'journals', 'knowledge_graph', 'knowledge_nuggets',
      'association_web', 'compression_memories', 'agent_consciousness', 'memory_gaps',
    ]) expect(sql).toContain(`'${table}'`);
    expect(sql).toContain('journal_key_scopes');
    expect(sql).toContain('idx_consciousness_workspace_agent');
  });

  test('database readiness applies the runtime mirror of the migration', async () => {
    const source = await fs.promises.readFile(
      new URL('../server/boot/database.js', import.meta.url), 'utf8'
    );
    expect(source).toContain('ensureMemoryTenancySchema(pool)');
  });
});

describe('sub-agent tenancy schema', () => {
  test('migration preserves legacy rows while adding registry and scratchpad scope', async () => {
    const sql = await fs.promises.readFile(
      new URL('../docker/037-subagent-tenancy.sql', import.meta.url), 'utf8'
    );
    for (const fragment of [
      'sub_agents_workspace_id_fkey', 'sub_agents_created_by_user_id_fkey',
      'sub_agent_scratchpad_workspace_id_fkey', 'idx_sub_agents_legacy_unscoped',
      'idx_sub_agent_scratchpad_legacy_unscoped',
    ]) expect(sql).toContain(fragment);
  });

  test('database readiness applies the runtime mirror of the migration', async () => {
    const source = await fs.promises.readFile(
      new URL('../server/boot/database.js', import.meta.url), 'utf8'
    );
    expect(source).toContain('ensureSubAgentTenancySchema(pool)');
  });
});

describe('AgentCard tenancy schema', () => {
  test('migration anchors scoped cards and indexes preserved legacy rows', async () => {
    const sql = await fs.promises.readFile(
      new URL('../docker/035-agent-card-tenancy.sql', import.meta.url), 'utf8'
    );
    expect(sql).toContain('agent_cards_workspace_id_fkey');
    expect(sql).toContain('idx_agent_cards_legacy_unscoped');
    expect(sql).toMatch(/owner_id IS NOT NULL AND workspace_id IS NULL/i);
  });
});
