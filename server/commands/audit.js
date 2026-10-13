import { createWorkspaceEvent } from '../operational-intelligence/factories.js';

function summarizeValue(value) {
  if (Array.isArray(value)) return { type: 'array', length: value.length };
  if (value && typeof value === 'object') return { type: 'object', keys: Object.keys(value).sort() };
  return { type: typeof value };
}

export async function recordCommandAudit({ db, command, context, input, output, error }) {
  if (!context.workspaceId) return null;

  try {
    return await createWorkspaceEvent({ db }, {
      workspaceId: context.workspaceId,
      type: error ? 'command.failed' : 'command.executed',
      actor: context.actor,
      payload: {
        commandId: command.id,
        status: error ? 'error' : 'ok',
        runtimeMode: context.runtimeMode,
        sideEffects: command.sideEffects,
        requiredCapabilities: command.requiredCapabilities,
        input: summarizeValue(input),
        output: summarizeValue(output),
        error: error ? String(error.message || error) : null,
      },
    });
  } catch {
    return null;
  }
}
