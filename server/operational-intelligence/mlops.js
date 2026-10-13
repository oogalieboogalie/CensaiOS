import { createArtifact, createWorkspaceEvent, resolveArtifact } from './factories.js';
import { buildMLOpsWebhookBody, calculateDriftState } from './drift-utils.js';

/**
 * MLOps Logic for Real-Time Data Drift Detection & Retraining Triggers.
 */

/**
 * Registers a new ML model deployment with its training baseline.
 */
export async function registerModelDeployment(ctx, { workspaceId, title, modelName, version, baseline, thresholds, owner }) {
  const data = {
    modelName,
    version,
    baseline: baseline || {},
    thresholds: thresholds || { driftScore: 0.1 },
    status: 'deployed',
    lastDriftScore: 0,
    windowSize: baseline?.windowSize || 10,
    buffer: [],
  };

  return createArtifact(ctx, {
    workspaceId,
    type: 'ml_model_deployment',
    title: title || `${modelName} v${version}`,
    owner: owner || { kind: 'system', id: 'mlops-orchestrator' },
    data,
  });
}

/**
 * Ingests real-time telemetry and runs drift detection.
 */
export async function ingestTelemetry(ctx, { workspaceId, deploymentId, features }) {
  const deployment = await resolveArtifact(ctx, { artifactId: deploymentId, workspaceId });
  if (!deployment || deployment.workspace_id !== workspaceId
    || deployment.artifact_type !== 'ml_model_deployment') {
    throw new Error('Deployment not found');
  }

  const baseline = deployment.data.baseline || {};
  const thresholds = deployment.data.thresholds;
  const driftState = calculateDriftState({ features, baseline, deploymentData: deployment.data });
  const { driftResults, maxDrift } = driftState;

  const deploymentPatch = {
    ...driftState.nextData,
    lastDriftScore: maxDrift,
    lastSeenAt: new Date().toISOString(),
  };
  await ctx.db.query(
    `UPDATE artifacts SET data = data || $1::jsonb, updated_at = NOW()
      WHERE id = $2 AND workspace_id = $3`,
    [JSON.stringify(deploymentPatch), deploymentId, workspaceId]
  );

  // Record telemetry event
  await createWorkspaceEvent(ctx, {
    workspaceId,
    type: 'ml.telemetry_ingested',
    actor: { kind: 'system', id: 'telemetry-service' },
    artifactId: deploymentId,
    payload: { driftResults, maxDrift },
  });

  if (maxDrift > thresholds.driftScore) {
    await triggerDriftAlert(ctx, { workspaceId, deploymentId, driftResults, maxDrift });
  }

  return { maxDrift, driftResults };
}

/**
 * Triggers a drift alert and potentially initiates retraining.
 */
async function triggerDriftAlert(ctx, { workspaceId, deploymentId, driftResults, maxDrift }) {
  const alert = await createArtifact(ctx, {
    workspaceId,
    type: 'ml_drift_alert',
    title: `Drift Alert: ${maxDrift.toFixed(3)}`,
    owner: { kind: 'system', id: 'drift-detector' },
    data: { deploymentId, driftResults, maxDrift, status: 'open' },
  });

  await createWorkspaceEvent(ctx, {
    workspaceId,
    type: 'ml.drift_detected',
    actor: { kind: 'system', id: 'drift-detector' },
    artifactId: alert.id,
    payload: { deploymentId, maxDrift },
  });

  await createWorkspaceEvent(ctx, {
    workspaceId,
    type: 'ml.retraining_triggered',
    actor: { kind: 'system', id: 'mlops-orchestrator' },
    artifactId: deploymentId,
    payload: { alertId: alert.id, reason: 'Significant drift detected' },
  });

  await notifyMLOpsWebhooks(ctx, { deploymentId, alertId: alert.id, maxDrift, driftResults });

  if (ctx.config?.retrainingWebhookUrl) {
    try {
      await fetch(ctx.config.retrainingWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deploymentId, alertId: alert.id, maxDrift }),
      });
    } catch (err) {
      console.error('Failed to trigger external retraining hook:', err.message);
    }
  }
}

async function notifyMLOpsWebhooks(ctx, alert) {
  const webhooks = ctx.config?.mlopsWebhooks || [];

  for (const hook of webhooks) {
    try {
      await fetch(hook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildMLOpsWebhookBody(hook, alert)),
      });
    } catch (err) {
      console.error(`Failed to trigger external webhook (${hook.type || 'generic'}):`, err.message);
    }
  }
}

/**
 * Manually triggers a retraining workflow.
 */
export async function triggerRetraining(ctx, { workspaceId, deploymentId, reason, actor }) {
  const deployment = await resolveArtifact(ctx, { artifactId: deploymentId, workspaceId });
  if (!deployment || deployment.workspace_id !== workspaceId
    || deployment.artifact_type !== 'ml_model_deployment') {
    throw new Error('Deployment not found');
  }

  return createWorkspaceEvent(ctx, {
    workspaceId,
    type: 'ml.retraining_triggered',
    actor: actor || { kind: 'user', id: 'unknown' },
    artifactId: deploymentId,
    payload: { reason: reason || 'Manual trigger' },
  });
}
