import pool from '../db.js';

/**
 * Unified Policy Engine for DevSecOps 2026.
 * Evaluates actions against defined policies (OPA Rego-style).
 */
export async function evaluatePolicy(action, input) {
  const { rows: policies } = await pool.query(
    'SELECT * FROM policies WHERE is_active = true'
  );

  const results = [];
  let finalDecision = 'allow';
  let reason = 'No active policies denied the action.';

  for (const policy of policies) {
    // Basic simulation of Rego evaluation.
    // In a real 2026 scenario, this would use a WASM-compiled OPA engine.
    const evaluation = simulateRego(policy.rego_code, input);

    if (evaluation.decision === 'deny') {
      finalDecision = 'deny';
      reason = `Policy "${policy.name}" denied action: ${evaluation.reason || 'No specific reason'}`;
      results.push({ policyId: policy.id, decision: 'deny', reason: evaluation.reason });
      break; // Short-circuit on first deny
    }

    results.push({ policyId: policy.id, decision: 'allow' });
  }

  return { decision: finalDecision, reason, details: results };
}

/**
 * Extremely basic Rego simulator for the purpose of this implementation.
 * Supports checking simple path or cost rules defined in the seeds.
 */
function simulateRego(rego, input) {
  if (rego.includes('input.path == "/app/scratch"') && input.path && !input.path.startsWith('/app/scratch')) {
    return { decision: 'deny', reason: 'Write outside unauthorized path /app/scratch' };
  }

  if (rego.includes('input.cost > 100') && input.cost > 100) {
    return { decision: 'deny', reason: 'Cost exceeds threshold of 100' };
  }

  return { decision: 'allow' };
}
