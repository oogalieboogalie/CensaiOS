import express from 'express';
import pool from '../db.js';
import { registerModelDeployment, ingestTelemetry, triggerRetraining } from '../operational-intelligence/mlops.js';
import { resolveArtifact } from '../operational-intelligence/factories.js';
import { operationalRouteError, resolveOperationalScope } from '../operational-intelligence/routeScope.js';
import { resourceRateLimiter } from '../middleware/standardRateLimits.js';

export const mlopsRouter = express.Router();
mlopsRouter.use(resourceRateLimiter);

mlopsRouter.post('/models', async (req, res) => {
  try {
    const { actor, workspaceId } = await resolveOperationalScope(req, { write: true });
    const { title, modelName, version, baseline, thresholds } = req.body || {};
    const result = await registerModelDeployment({ db: pool }, {
      workspaceId,
      owner: actor,
      title,
      modelName,
      version,
      baseline,
      thresholds,
    });
    res.status(201).json(result);
  } catch (err) {
    operationalRouteError(res, err);
  }
});

mlopsRouter.post('/models/:id/retrain', async (req, res) => {
  try {
    const { actor, workspaceId } = await resolveOperationalScope(req, { write: true });
    const result = await triggerRetraining({ db: pool }, {
      workspaceId,
      deploymentId: req.params.id,
      reason: req.body.reason,
      actor,
    });
    res.json(result);
  } catch (err) {
    operationalRouteError(res, err);
  }
});

mlopsRouter.get('/models', async (req, res) => {
  try {
    const { workspaceId } = await resolveOperationalScope(req);
    const { rows } = await pool.query(
      `SELECT * FROM artifacts
       WHERE workspace_id = $1 AND artifact_type = 'ml_model_deployment' AND deleted_at IS NULL
       ORDER BY updated_at DESC`,
      [workspaceId]
    );
    res.json(rows);
  } catch (err) {
    operationalRouteError(res, err);
  }
});

mlopsRouter.get('/models/:id', async (req, res) => {
  try {
    const { workspaceId } = await resolveOperationalScope(req);
    const artifact = await resolveArtifact({ db: pool }, { artifactId: req.params.id, workspaceId });
    if (!artifact || artifact.workspace_id !== workspaceId
      || artifact.artifact_type !== 'ml_model_deployment') {
      return res.status(404).json({ error: 'Model deployment not found' });
    }
    res.json(artifact);
  } catch (err) {
    operationalRouteError(res, err);
  }
});

mlopsRouter.post('/telemetry', async (req, res) => {
  try {
    const { workspaceId } = await resolveOperationalScope(req, { write: true });
    const { deploymentId, features } = req.body;
    const result = await ingestTelemetry({ db: pool }, {
      workspaceId,
      deploymentId,
      features,
    });
    res.json(result);
  } catch (err) {
    operationalRouteError(res, err);
  }
});

mlopsRouter.get('/models/:id/alerts', async (req, res) => {
  try {
    const { workspaceId } = await resolveOperationalScope(req);
    const deployment = await resolveArtifact({ db: pool }, { artifactId: req.params.id, workspaceId });
    if (!deployment || deployment.workspace_id !== workspaceId
      || deployment.artifact_type !== 'ml_model_deployment') {
      return res.status(404).json({ error: 'Model deployment not found' });
    }
    const { rows } = await pool.query(
      `SELECT * FROM artifacts
       WHERE workspace_id = $1 AND artifact_type = 'ml_drift_alert'
         AND data->>'deploymentId' = $2 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [workspaceId, req.params.id]
    );
    res.json(rows);
  } catch (err) {
    operationalRouteError(res, err);
  }
});
