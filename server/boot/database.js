import pool from '../db.js';
import { dbReady, setDbReady } from '../dbState.js';
import { initSecrets } from '../secrets.js';
import { ensureAgentTaskReceiptSchema } from '../memory/tasks.js';
import { ensureJulesTaskSyncSchema } from '../jules-task-sync/index.js';
import { ensureMultiUserSchema } from './authSchema.js';
import { ensureCapabilitySchema } from './capabilitySchema.js';
import { ensureAttributeSchema } from './attributeSchema.js';
import { ensurePolicySchema } from '../policy/schema.js';
import { ensureUserApiKeySchema } from './userApiKeySchema.js';
import { ensureAgentWakeupSchema } from '../agent-wakeups/schema.js';
import { createLogger } from '../logger.js';
import { migrateLegacyOAuthCredentials } from '../credentials/oauthStore.js';
import { ensureWorkspaceSchema } from '../workspaces/schema.js';
import { ensureRunCausalitySchema } from '../runs/schema.js';
import { ensureScheduleTenancySchema } from '../scheduler/schema.js';
import { ensureAutonomyTenancySchema } from '../autonomy/schema.js';
import { ensureAgentCardTenancySchema } from '../agent-registry/tenancySchema.js';
import { ensureAgentCardInstallSchema } from '../agent-registry/installSchema.js';
import { ensureSalesLeadSchema } from '../salesLeads/schema.js';
import { ensureMemoryTenancySchema } from '../memory/tenancySchema.js';
import { ensureSubAgentTenancySchema } from '../memory/subagentTenancySchema.js';
import { ensureCanvasIntegrationTokenSchema } from './canvasTokenSchema.js';

const log = createLogger('boot-db');

const RETRY_BASE_MS = 5000;
const RETRY_MAX_MS = 15000;

let retryTimer = null;
let retryAttempts = 0;
let poolWatcherAttached = false;

async function probeDb() {
  await pool.query('SELECT 1');
  await ensureAgentTaskReceiptSchema();
  await ensureJulesTaskSyncSchema();
  await ensureMultiUserSchema();
  await migrateLegacyOAuthCredentials();
  await ensureWorkspaceSchema(pool);
  await ensureScheduleTenancySchema(pool);
  await ensureAgentWakeupSchema();
  await ensureAutonomyTenancySchema(pool);
  await ensureAgentCardTenancySchema(pool);
  await ensureAgentCardInstallSchema(pool);
  await ensureSalesLeadSchema(pool);
  await ensureMemoryTenancySchema(pool);
  await ensureSubAgentTenancySchema(pool);
  await ensureCanvasIntegrationTokenSchema(pool);
  await ensureRunCausalitySchema(pool);
  await ensureCapabilitySchema();
  await ensureAttributeSchema();
  await ensurePolicySchema();
  await ensureUserApiKeySchema();
}

function markOnline(extra = {}) {
  setDbReady(true);
  log.info('PostgreSQL connected — memory system online', extra);
}

function scheduleRetry() {
  if (retryTimer) return;
  const delay = Math.min(RETRY_BASE_MS * (retryAttempts + 1), RETRY_MAX_MS);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    retryAttempts += 1;
    probeDb().then(() => {
      const attempts = retryAttempts;
      retryAttempts = 0;
      markOnline({ attempts });
    }).catch((err) => {
      // First retry and every ~minute after: enough signal without log spam.
      if (retryAttempts === 1 || retryAttempts % 6 === 0) {
        log.warn('PostgreSQL still unavailable — retrying in the background', {
          error: err.message,
          attempts: retryAttempts,
        });
      }
      scheduleRetry();
    });
  }, delay);
  // Polling for a database should never hold the process open.
  if (typeof retryTimer.unref === 'function') retryTimer.unref();
}

function watchPool() {
  if (poolWatcherAttached) return;
  poolWatcherAttached = true;
  pool.on('error', (err) => {
    recheckDb(err.message).catch(() => {});
  });
}

export async function checkDb() {
  try {
    await probeDb();
    setDbReady(true);
    log.info('PostgreSQL connected');
  } catch (err) {
    log.warn('PostgreSQL not available — memory system disabled, chat still works; retrying in the background', { error: err.message });
    scheduleRetry();
  }
  watchPool();
  await initSecrets();
}

// Re-verify after a runtime pool error: a single idle-client error does not
// mean the database is gone, so only drop readiness when a probe fails too.
export async function recheckDb(reason = 'runtime error') {
  try {
    await probeDb();
    if (!dbReady()) markOnline({ reason });
  } catch (err) {
    if (dbReady()) {
      setDbReady(false);
      log.warn('PostgreSQL connection lost — memory system disabled until it returns', { reason, error: err.message });
    }
    scheduleRetry();
  }
}

export function stopDbRetry() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  retryAttempts = 0;
}
