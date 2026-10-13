import crypto from 'crypto';
import { WebSocketServer } from 'ws';
import { startBackend, startAgentBackend } from './backends.js';
import { publishWorkspaceEvent } from '../collaboration/workspaceHub.js';
import { filterAgentChunk, flushAgentCarry, agentTailText } from './agentOutput.js';
import { defaultAuthenticate } from '../ws/agentRegistry.js';
import {
  authorizeTerminalConnection,
  rejectTerminalUpgrade,
  TERMINAL_WS_PATH,
  terminalSessionKey,
} from './access.js';
import { 
  log, sessions, resolveCwd, safeJsonSend, broadcast, appendScrollback,
  AGENT_IDLE_REAP_MS, REAP_GRACE_MS
} from './shared.js';

export function getTerminalSession(sessionId) {
  return sessions.get(sessionId) || null;
}

async function createSession(sessionId, {
  cwd, hasProject, size, owner, clientSessionId, startBackendImpl, agentRun,
}) {
  const backend = agentRun
    ? await startAgentBackend(cwd, agentRun.prompt, size)
    : await startBackendImpl(cwd, hasProject, size);
  const session = {
    id: sessionId,
    clientSessionId,
    owner,
    pty: backend.proc,
    sockets: new Set(),
    cwd,
    backendLabel: backend.label,
    isSandbox: Boolean(backend.isSandbox),
    shell: backend.shell || 'bash',
    agentEnabled: false,
    agentRun: agentRun ? { prompt: agentRun.prompt } : null,
    boundAgentIds: new Set(),
    busy: false,
    scrollback: '',
    alive: true,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    reapTimer: null,
  };
  sessions.set(sessionId, session);

  backend.proc.onData((data) => {
    session.lastActivity = Date.now();
    const emit = session.agentRun ? filterAgentChunk(session, data) : data;
    appendScrollback(session, emit);
    broadcast(session, { type: 'output', data: emit });
  });

  backend.proc.onExit(({ exitCode }) => {
    session.alive = false;
    log.info('shell exited', { sessionId, backend: backend.label, code: exitCode });
    broadcast(session, { type: 'exit', code: exitCode });
    if (session.agentRun && owner?.workspaceId) {
      // Agent runs stay open on their transcript and notify the canvas:
      // a sidebar toast carries the tail, one click reopens this window.
      if (session.promoCarry) {
        const rest = flushAgentCarry(session);
        if (rest) {
          appendScrollback(session, rest);
          broadcast(session, { type: 'output', data: rest });
        }
      }
      const tail = agentTailText(session.scrollback);
      publishWorkspaceEvent(owner.workspaceId, {
        type: 'opencode.completed',
        workspaceId: owner.workspaceId,
        run: {
          prompt: String(session.agentRun.prompt || '').slice(0, 200),
          exitCode: exitCode ?? 0,
          tail,
          at: new Date().toISOString(),
        },
        windowId: session.clientSessionId,
        actor: { type: 'agent', id: 'opencode', label: 'OpenCode' },
      });
      return;
    }
    for (const ws of session.sockets) {
      try { ws.close(); } catch { /* already closing */ }
    }
    if (session.reapTimer) clearTimeout(session.reapTimer);
    sessions.delete(sessionId);
  });

  log.info('session created', { sessionId, backend: backend.label, pid: backend.proc.pid, isSandbox: session.isSandbox });
  return session;
}

function scheduleReap(session) {
  if (session.reapTimer) clearTimeout(session.reapTimer);
  const keepForAgent = (session.agentEnabled && session.boundAgentIds.size > 0)
    // Headless runs survive window switches so rapid-fire never cancels a
    // running agent; the exit handler + toast report back when it lands.
    || (session.agentRun && session.alive);
  const delay = keepForAgent ? AGENT_IDLE_REAP_MS : REAP_GRACE_MS;
  session.reapTimer = setTimeout(() => {
    if (sessions.get(session.id) !== session) return;
    if (session.sockets.size > 0) return;
    if (keepForAgent && Date.now() - session.lastActivity < AGENT_IDLE_REAP_MS) {
      scheduleReap(session);
      return;
    }
    try { session.pty.kill(); } catch { /* already dead */ }
    sessions.delete(session.id);
    log.info('session reaped', { sessionId: session.id, keptForAgent: keepForAgent });
  }, delay);
}

export function attachTerminalServer(server, options = {}) {
  const wss = new WebSocketServer({ noServer: true });
  const authenticate = options.authenticate
    || (request => defaultAuthenticate(request, options));
  const authorize = options.authorize
    || ((requestUrl, actor) => authorizeTerminalConnection(requestUrl, actor, options));
  const startBackendImpl = options.startBackend || startBackend;

  server.on('upgrade', (request, socket, head) => {
    let requestUrl;
    try { requestUrl = new URL(request.url || '/', 'http://localhost'); }
    catch { rejectTerminalUpgrade(socket, { statusCode: 400 }); return; }
    if (requestUrl.pathname !== TERMINAL_WS_PATH) return;

    Promise.resolve(authenticate(request))
      .then(actor => {
        if (!actor?.userId) throw Object.assign(new Error('Authentication is required.'), { statusCode: 401 });
        return authorize(requestUrl, actor);
      })
      .then(owner => {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request, { requestUrl, owner });
        });
      })
      .catch(error => {
        log.warn('terminal upgrade rejected', { status: error.statusCode || 500, code: error.code || null });
        rejectTerminalUpgrade(socket, error);
      });
  });

  wss.on('connection', async (ws, _request, connection) => {
    const { requestUrl, owner } = connection;
    const params = requestUrl.searchParams;
    const rawCwd = params.get('cwd');
    const hasProject = Boolean(rawCwd && rawCwd.trim());
    const cwd = resolveCwd(rawCwd);
    const size = {
      cols: Math.max(2, parseInt(params.get('cols'), 10) || 80),
      rows: Math.max(1, parseInt(params.get('rows'), 10) || 24),
    };
    const clientSessionId = (params.get('sessionId') || '').trim() || `eph-${crypto.randomUUID()}`;
    const sessionId = terminalSessionKey({ ...owner, sessionId: clientSessionId });

    // Headless agent run: `?agent=opencode&prompt=...`. Never shares a shell
    // session — a mismatched prompt kills and recreates. Invalid agent
    // params are rejected after connect (upgrade is already accepted).
    const agentKind = (params.get('agent') || '').trim().toLowerCase();
    const agentPrompt = (params.get('prompt') || '').trim();
    const agentRun = agentKind === 'opencode' && agentPrompt ? { prompt: agentPrompt } : null;
    if (agentKind && !agentRun) {
      safeJsonSend(ws, { type: 'error', reason: 'Agent run requires agent=opencode and a non-empty prompt.' });
      ws.close(1008, 'invalid agent run');
      return;
    }

    let session = sessions.get(sessionId);
    if (session && !session.alive) {
      sessions.delete(sessionId);
      session = null;
    }
    if (session && session.cwd !== cwd) {
      try { session.pty.kill(); } catch { /* already gone */ }
      sessions.delete(sessionId);
      session = null;
    }
    if (session && (session.agentRun?.prompt || null) !== (agentRun?.prompt || null)) {
      try { session.pty.kill(); } catch { /* already gone */ }
      sessions.delete(sessionId);
      session = null;
    }
    const isNew = !session;
    if (!session) {
      try {
        session = await createSession(sessionId, {
          cwd, hasProject, size, owner, clientSessionId, startBackendImpl, agentRun,
        });
      } catch (error) {
        log.error('failed to start any backend', { sessionId, cwd, error: error.message });
        safeJsonSend(ws, { type: 'output', data: `\r\nFailed to start a terminal: ${error.message}\r\n` });
        ws.close();
        return;
      }
    }

    if (session.reapTimer) { clearTimeout(session.reapTimer); session.reapTimer = null; }
    session.sockets.add(ws);

    log.info('connection open', { sessionId, joined: !isNew, viewers: session.sockets.size });
    safeJsonSend(ws, {
      type: 'meta', cwd: session.cwd, backend: session.backendLabel,
      workspaceId: owner.workspaceId, sessionId: clientSessionId,
      agent: session.agentRun ? 'opencode' : null,
    });
    if (!isNew && session.scrollback) {
      safeJsonSend(ws, { type: 'output', data: session.scrollback, replay: true });
    }

    ws.on('message', (raw) => {
      if (!session.alive) return;
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        session.pty.write(raw.toString());
        return;
      }
      if (message.type === 'input' && typeof message.data === 'string') {
        session.lastActivity = Date.now();
        session.pty.write(message.data);
      } else if (message.type === 'resize') {
        const cols = Math.max(2, parseInt(message.cols, 10) || size.cols);
        const rows = Math.max(1, parseInt(message.rows, 10) || size.rows);
        try { session.pty.resize(cols, rows); } catch { /* shell already gone */ }
      } else if (message.type === 'bind') {
        session.agentEnabled = Boolean(message.agentEnabled);
        session.boundAgentIds = new Set(
          Array.isArray(message.agentIds) ? message.agentIds.filter((x) => typeof x === 'string') : []
        );
        log.debug('session bind', { sessionId, agentEnabled: session.agentEnabled, agents: session.boundAgentIds.size });
      }
    });

    ws.on('close', () => {
      session.sockets.delete(ws);
      if (session.sockets.size === 0) scheduleReap(session);
    });
  });

  return wss;
}
