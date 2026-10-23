// server/agentEndpoints/outsideListener.js
//
// A second, tiny web server that serves ONLY agent endpoints (/api/mcp/...)
// and followed profiles (/api/social/v1/...).
// This is the port people point a tunnel at to reach their agents from other
// computers. Tunnelling the main censaiOS port would put the whole board on
// the internet (a laptop install signs in with one click), so the tunnel
// guide always names this port instead. Every call still needs an agent key.
//   CENSAI_AGENT_ENDPOINT_PORT  default 3003, "off" to disable
//   CENSAI_AGENT_ENDPOINT_HOST  default 127.0.0.1 (0.0.0.0 inside Docker,
//                               where compose publishes it on 127.0.0.1 only)

import express from 'express';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { agentEndpointPublicRouter } from '../routes/agentEndpointsPublic.js';
import { socialPublicRouter } from '../routes/socialPublic.js';

const log = createLogger('agent-endpoints');
let listening = null;

export function createOutsideApp(router = agentEndpointPublicRouter, socialRouter = socialPublicRouter) {
  const app = express();
  app.disable('x-powered-by');
  // MCP's Streamable HTTP rules: refuse browser pages from other sites.
  app.use((req, res, next) => {
    if (req.get('origin')) return res.status(403).json({ error: 'Browser pages cannot call agent endpoints.' });
    return next();
  });
  app.use('/api/mcp', express.json({ limit: '1mb' }), router);
  // Profiles people follow from another censaiOS (social canvas), each behind its key.
  if (socialRouter) app.use('/api/social/v1', socialRouter);
  app.use((_req, res) => res.status(404).json({ error: 'Only censaiOS agent endpoints and profiles are served here.' }));
  return app;
}

export function outsideListenerConfig(env = process.env) {
  const raw = String(env.CENSAI_AGENT_ENDPOINT_PORT ?? '').trim().toLowerCase();
  if (raw === 'off' || raw === '0' || raw === 'false') return null;
  const port = Number(raw || 3003);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const host = env.CENSAI_AGENT_ENDPOINT_HOST || (env.CENSAI_IN_CONTAINER === '1' ? '0.0.0.0' : '127.0.0.1');
  return { port, host };
}

/** Start the outside-only server. Never throws; a busy port just leaves it off. */
export function startOutsideListener(config = outsideListenerConfig()) {
  if (!config || listening) return listening;
  const server = createOutsideApp().listen(config.port, config.host, () => {
    listening = { port: config.port, host: config.host, server };
    log.info('agent endpoints listening for tunnels', { url: `http://${config.host}:${config.port}/api/mcp` });
  });
  server.on('error', (error) => {
    log.warn('agent endpoint port not opened', { port: config.port, code: safeErrorCode(error) });
  });
  return null;
}

/** The port a tunnel should point at, or null when the outside server is off. */
export function outsideListenerPort() {
  return listening?.port ?? null;
}
