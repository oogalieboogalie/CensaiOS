import pool from '../db.js';
import { createArtifact } from '../operational-intelligence/factories.js';

/**
 * Records immutable evidence for an automated or AI action.
 * Ties policy evaluation to the action record.
 */
export async function recordPolicyEvidence(ctx, {
  policyResult,
  actionType,
  actor,
  resourceId,
  inputData,
  workspaceId
}) {
  // 1. Create an artifact for the evidence trail
  const evidenceArtifact = await createArtifact(ctx, {
    workspaceId,
    owner: actor,
    type: 'policy_evidence',
    title: `Evidence: ${actionType} - ${new Date().toISOString()}`,
    data: {
      actionType,
      policyResult,
      inputData,
      timestamp: new Date().toISOString()
    },
    metadata: {
      decision: policyResult.decision,
      resourceId
    }
  });

  // 2. Insert into policy_evaluations for quick lookup and reporting
  const { rows } = await pool.query(
    `INSERT INTO policy_evaluations
      (action_type, actor_id, actor_kind, resource_id, input_data, decision, reason, evidence_artifact_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
     RETURNING id`,
    [
      actionType,
      actor.id,
      actor.kind,
      resourceId,
      JSON.stringify(inputData),
      policyResult.decision,
      policyResult.reason,
      evidenceArtifact.id
    ]
  );

  return { evaluationId: rows[0].id, artifactId: evidenceArtifact.id };
}
