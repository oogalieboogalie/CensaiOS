import pool from './db.js';
import { getTaskWorkerStatus } from './taskWorker.js';
import { getSchedulerWorkerStatus } from './schedulerWorker.js';
import { getAgentCardRunWorkerStatus } from './agent-card-runs/worker.js';
import { getAgentWakeupWorkerStatus } from './agent-wakeups/worker.js';
import { checkQdrantHealth } from './qdrant.js';
import { getSecret } from './secrets.js';
import { setDbReady } from './dbState.js';
import { getFreeTierReadiness } from './aiGateway/freeTierRuntime.js';
import { getHealthOwnershipStatus } from './healthOwnership.js';

const DB_UNAVAILABLE_DEGRADED_STATE = 'database_unavailable';

export async function getSystemStatus() {
  let databaseConnected = false;
  let databaseError = null;
  try {
    await pool.query('SELECT 1');
    databaseConnected = true;
    setDbReady(true);
  } catch (err) {
    databaseConnected = false;
    databaseError = err.message;
    setDbReady(false);
  }
  const {
    scheduleOwnership, autonomyOwnership, agentCardOwnership, agentCardInstallOwnership, memoryOwnership,
    subAgentOwnership, equipmentOwnership, capabilityOwnership, toolApprovalOwnership, familyBoundary,
    toolPackageOwnership,
  } = await getHealthOwnershipStatus(databaseConnected);

  const taskWorker = getTaskWorkerStatus(databaseConnected, autonomyOwnership);
  const schedulerWorker = getSchedulerWorkerStatus({ databaseConnected, ownership: scheduleOwnership });
  const agentCardWorker = getAgentCardRunWorkerStatus(databaseConnected);
  const agentWakeupWorker = getAgentWakeupWorkerStatus(databaseConnected, autonomyOwnership);
  const qdrant = await checkQdrantHealth();
  const freeAiAccess = getFreeTierReadiness();

  const aiBaseUrl = (process.env.AI_BASE_URL || 'http://localhost:11434/v1').replace(/\/+$/, '');
  const aiModel = process.env.AI_MODEL || 'minimax-m2.5:cloud';
  const aiApiKey = getSecret('AI_API_KEY') || process.env.AI_API_KEY || 'ollama';

  const degradedState = [
    !databaseConnected && DB_UNAVAILABLE_DEGRADED_STATE,
    !familyBoundary.ready && (familyBoundary.reason || 'family_boundary_unavailable'),
    !agentCardInstallOwnership.ready && 'agent_card_install_ownership_unavailable',
    !capabilityOwnership.ready && 'agent_capability_ownership_unavailable',
    !toolPackageOwnership.ready && 'tool_package_ownership_unavailable',
    !toolApprovalOwnership.ready && 'tool_approval_ownership_unavailable',
    taskWorker.degraded && taskWorker.degradedReason,
    !autonomyOwnership.ready && 'autonomy_ownership_ambiguous',
    !memoryOwnership.ready && 'memory_ownership_unavailable',
    !subAgentOwnership.ready && 'sub_agent_ownership_unavailable',
    !equipmentOwnership.ready && 'agent_equipment_ownership_unavailable',
    !freeAiAccess.ready && 'free_ai_configuration_invalid',
    !scheduleOwnership.ready && 'schedule_ownership_ambiguous',
  ].find(Boolean) || null;

  const status = {
    ok: databaseConnected,
    ready: databaseConnected && !!aiApiKey && scheduleOwnership.ready && autonomyOwnership.ready
      && memoryOwnership.ready && subAgentOwnership.ready && equipmentOwnership.ready
      && capabilityOwnership.ready && toolApprovalOwnership.ready
      && toolPackageOwnership.ready
      && agentCardInstallOwnership.ready
      && familyBoundary.ready && freeAiAccess.ready,
    database: {
      connected: databaseConnected,
      ready: databaseConnected,
      error: databaseError,
    },
    qdrant: {
      ready: qdrant.ready,
      connected: qdrant.connected,
      error: qdrant.error,
    },
    modelProvider: {
      ready: !!aiApiKey,
      baseUrl: aiBaseUrl,
      model: aiModel,
      hasKey: !!aiApiKey,
    },
    taskWorker,
    schedulerWorker,
    agentCardWorker,
    agentWakeupWorker,
    autonomyOwnership,
    agentCardOwnership,
    agentCardInstallOwnership,
    memoryOwnership,
    subAgentOwnership,
    equipmentOwnership,
    capabilityOwnership,
    toolPackageOwnership,
    toolApprovalOwnership,
    familyBoundary,
    freeAiAccess,
    degraded: Boolean(degradedState),
    degradedState,
  };

  return status;
}
