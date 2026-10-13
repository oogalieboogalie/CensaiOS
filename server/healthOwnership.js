import { getScheduleOwnershipSummary } from './memory/schedules.js';
import { getAutonomyOwnershipSummary } from './autonomy/status.js';
import { getAgentCardOwnershipSummary } from './agent-registry/access.js';
import { getAgentCardInstallOwnershipSummary } from './agent-registry/installStatus.js';
import { getMemoryOwnershipSummary } from './memory/tenancyStatus.js';
import { getSubAgentOwnershipSummary } from './memory/subagentTenancyStatus.js';
import { getEquipmentOwnershipSummary } from './attributes/tenancyStatus.js';
import { getCapabilityOwnershipSummary } from './capabilities/tenancyStatus.js';
import { getToolApprovalOwnershipSummary } from './approvals/tenancyStatus.js';
import { getFamilyBoundaryStatus } from './agents/familyBoundaryStatus.js';
import { getToolPackageOwnershipSummary } from './capabilities/packageStatus.js';

const STATUS_LOADERS = Object.freeze({
  scheduleOwnership: [getScheduleOwnershipSummary, { legacyUnownedCount: null, blockingUnownedCount: null }],
  autonomyOwnership: [getAutonomyOwnershipSummary, {
    legacyMessageCount: null, legacyTaskCount: null, blockingTaskCount: null, blockingWakeupCount: null,
  }],
  agentCardOwnership: [getAgentCardOwnershipSummary, {
    systemCount: null, legacyUnscopedCount: null, scopedCustomCount: null,
  }],
  agentCardInstallOwnership: [getAgentCardInstallOwnershipSummary, {
    totalCount: null, workspaceCount: null, cardCount: null,
  }],
  memoryOwnership: [getMemoryOwnershipSummary, { legacyQuarantinedCount: null, scopedCount: null }],
  subAgentOwnership: [getSubAgentOwnershipSummary, {
    legacyUnscopedCount: null, scopedCount: null, legacyScratchpadCount: null, scopedScratchpadCount: null,
  }],
  equipmentOwnership: [getEquipmentOwnershipSummary, { legacyQuarantinedCount: null, scopedCount: null }],
  capabilityOwnership: [getCapabilityOwnershipSummary, { legacyQuarantinedCount: null, scopedCount: null }],
  toolPackageOwnership: [getToolPackageOwnershipSummary, {
    totalCount: null, workspaceCount: null, validCount: null,
    invalidCount: null, orphanCapabilityCount: null,
  }],
  toolApprovalOwnership: [getToolApprovalOwnershipSummary, {
    totalCount: null, pendingCount: null, executingCount: null, staleExecutingCount: null,
  }],
  familyBoundary: [getFamilyBoundaryStatus, {}],
});

async function loadStatus(loader, fallback, error) {
  try {
    return await loader();
  } catch (cause) {
    return { ready: false, ...fallback, error: cause.message || error };
  }
}

export async function getHealthOwnershipStatus(databaseConnected) {
  const entries = Object.entries(STATUS_LOADERS);
  if (!databaseConnected) {
    return Object.fromEntries(entries.map(([key]) => [key, {
      ready: false, ...STATUS_LOADERS[key][1], error: 'database_unavailable',
    }]));
  }
  const loaded = await Promise.all(entries.map(async ([key, [loader, fallback]]) => [
    key, await loadStatus(loader, fallback, `${key}_check_failed`),
  ]));
  return Object.fromEntries(loaded);
}
