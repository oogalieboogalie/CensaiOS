import pool from '../../db.js';
import { getAgentSession, runInTerminalSession } from '../../terminal.js';

// Friendly name for the in-terminal attribution banner; falls back to the id.
async function resolveAgentName(agentId) {
  try {
    const { rows } = await pool.query('SELECT name FROM agents WHERE id = $1', [agentId]);
    return rows[0]?.name || agentId;
  } catch {
    return agentId;
  }
}

export async function handleTerminalTool(agentId, name, args = {}) {
  if (name !== 'terminal_run') throw new Error(`Unknown terminal tool: ${name}`);

  const command = String(args.command || '').trim();
  if (!command) return 'Error: terminal_run requires a non-empty "command".';

  const sessionId = args.session_id || args.sessionId || null;
  const resolved = getAgentSession(agentId, sessionId);
  if (resolved.error) return resolved.error;

  const agentName = await resolveAgentName(agentId);
  const result = await runInTerminalSession(resolved.session.id, command, {
    agentId,
    agentName,
    timeoutMs: args.timeout_ms,
  });

  if (!result.ok) return result.error || 'terminal_run failed.';

  const header = `TERMINAL (${resolved.session.id}${resolved.session.isSandbox ? ', sandbox' : ''}) — $ ${command}`;
  if (result.timedOut) {
    return `${header}\n[${result.note}]\n${result.output || '(no output captured yet)'}`;
  }
  return `${header}\nExit code: ${result.exitCode}\n${result.output}`;
}
