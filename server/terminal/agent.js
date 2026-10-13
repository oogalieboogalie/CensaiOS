import { runnerClient } from '../runner/client.js';
import { isDockerAvailable, execInSandbox } from '../sandbox/index.js';
import { isCatastrophic } from '../terminalSafety.js';
import { getRuntimeMode } from '../middleware/runtimeMode.js';
import { log, sessions, broadcast, appendScrollback } from './shared.js';

const MAX_AGENT_OUTPUT = 8000;
const DEFAULT_AGENT_TIMEOUT = 120_000;
const MAX_AGENT_TIMEOUT = 600_000;
const MAX_AGENT_BUFFER = 10 * 1024 * 1024;

function truncateOut(str, max = MAX_AGENT_OUTPUT) {
  if (!str) return '';
  return str.length <= max ? str : `${str.slice(0, max)}\n... [truncated at ${max} chars]`;
}

export function getAgentSession(agentId, sessionId) {
  if (sessionId) {
    const s = sessions.get(sessionId);
    if (s && s.alive && s.agentEnabled && s.boundAgentIds.has(agentId)) return { session: s };
    return { error: 'No agent-enabled terminal with that id is bound to you.' };
  }
  const matches = [...sessions.values()].filter(
    (s) => s.alive && s.agentEnabled && s.boundAgentIds.has(agentId)
  );
  if (matches.length === 1) return { session: matches[0] };
  if (matches.length === 0) {
    return { error: 'No agent-enabled terminal is attached to you. Ask the user to attach you to a terminal and turn on its agent toggle.' };
  }
  return { error: `Bound to ${matches.length} terminals — specify sessionId (one of: ${matches.map((s) => s.id).join(', ')}).` };
}

export async function runInTerminalSession(sessionId, command, opts = {}) {
  const { agentId, agentName = 'agent', timeoutMs = DEFAULT_AGENT_TIMEOUT } = opts;
  const session = sessions.get(sessionId);
  if (!session || !session.alive) return { ok: false, error: 'No live terminal session for that id.' };
  if (!session.agentEnabled || !agentId || !session.boundAgentIds.has(agentId)) {
    return { ok: false, error: 'This terminal is not agent-enabled for you. The user must attach you and turn on the agent terminal toggle.' };
  }
  if (getRuntimeMode() === 'cloud_saas' && !session.isSandbox) {
    return { ok: false, error: 'In cloud mode, agent terminal commands run only in the Docker sandbox; this session is not sandboxed.' };
  }
  const cmd = String(command || '').trim();
  if (!cmd) return { ok: false, error: 'Empty command.' };

  const why = isCatastrophic(cmd);
  if (why) {
    const note = `\r\n\x1b[31m⤷ ${agentName} ▸ BLOCKED (${why}): ${cmd}\x1b[0m\r\n`;
    broadcast(session, { type: 'output', data: note });
    appendScrollback(session, note);
    log.warn('tripwire blocked agent command', { sessionId, agentId, why, cmd: cmd.slice(0, 120) });
    return { ok: false, blocked: true, error: `Refused — "${cmd}" matched the catastrophic tripwire (${why}). Not executed.` };
  }
  if (session.busy) return { ok: false, error: 'Terminal is busy with another agent command; retry shortly.' };
  session.busy = true;

  const banner = `\r\n\x1b[36m⤷ ${agentName} ▸ ${cmd}\x1b[0m\r\n`;
  broadcast(session, { type: 'output', data: banner });
  appendScrollback(session, banner);

  const clamp = Math.min(Math.max(Number(timeoutMs) || DEFAULT_AGENT_TIMEOUT, 1000), MAX_AGENT_TIMEOUT);
  let stdout = ''; let stderr = ''; let code = 0; let timedOut = false;
  const done = log.startTimer();
  try {
    if (session.isSandbox && await isDockerAvailable()) {
      const r = await execInSandbox(session.cwd, cmd, { timeoutMs: clamp, maxBuffer: MAX_AGENT_BUFFER });
      stdout = r.stdout || ''; stderr = r.stderr || ''; code = r.code ?? 0;
    } else {
      const r = await runnerClient.exec(cmd, [], { cwd: session.cwd, timeout: clamp, windowsHide: true, maxBuffer: MAX_AGENT_BUFFER, shell: true });
      stdout = r.stdout || ''; stderr = r.stderr || ''; code = r.code ?? 0;
      if (r.timedOut) timedOut = true;
    }
  } catch (err) {
    if (err.timedOut) timedOut = true;
    stderr = err.message || String(err); code = 1;
  } finally {
    session.busy = false;
  }

  log.info('agent command', { sessionId, agentId, code, timedOut, ms: done(), cmd: cmd.slice(0, 120) });

  const body = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
  const mirror = `${body ? `${body.replace(/\r?\n/g, '\r\n')}\r\n` : ''}\x1b[2m⤷ ${agentName} exit ${timedOut ? 'timeout' : code}\x1b[0m\r\n`;
  broadcast(session, { type: 'output', data: mirror });
  appendScrollback(session, mirror);

  if (timedOut) {
    return { ok: true, timedOut: true, exitCode: null, output: truncateOut(body), note: `Command exceeded ${clamp}ms; it may still be running.` };
  }
  return { ok: true, exitCode: code, output: truncateOut(body) || '(no output)' };
}
