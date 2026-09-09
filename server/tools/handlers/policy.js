import { evaluatePolicy } from '../../policy/engine.js';
import { recordPolicyEvidence } from '../../policy/evidence.js';

export async function handlePolicyTool(agentId, name, args, ctx) {
  const workspaceId = args.workspace_id || 'global';
  const actor = { kind: 'agent', id: agentId };

  if (name === 'policy_evaluate') {
    const result = await evaluatePolicy(args.action_type, args.input_data);

    // Auto-record evidence for explicit evaluations
    await recordPolicyEvidence(ctx, {
      policyResult: result,
      actionType: args.action_type,
      actor,
      resourceId: args.input_data.path || args.input_data.resourceId,
      inputData: args.input_data,
      workspaceId
    });

    return result;
  }

  if (name === 'policy_record_evidence') {
    const policyResult = {
      decision: args.decision,
      reason: args.reason || 'Manual evidence record'
    };

    return await recordPolicyEvidence(ctx, {
      policyResult,
      actionType: args.action_type,
      actor,
      resourceId: args.resource_id,
      inputData: args.input_data,
      workspaceId
    });
  }

  throw new Error(`Unknown policy tool: ${name}`);
}
