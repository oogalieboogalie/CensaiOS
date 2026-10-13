// server/routes/outsideTools.js
//
// The Tools panel's side of outside MCP servers (behind the session guard):
// add a server by web address (or, on the desktop app, by a command that
// starts it), check which tools it offers, give it to agents, switch it off,
// remove it. Everything is scoped to the signed-in user. A server's key is
// put in the key vault and never sent back to the browser.

import express from 'express';
import pool from '../db.js';
import { dbReady } from '../dbState.js';
import { localFilesystemAllowed } from '../middleware/runtimeMode.js';
import { assertSystemAdmin } from '../security/systemAdmin.js';
import * as store from '../outsideTools/store.js';
import { forget, listServerTools } from '../outsideTools/connections.js';
import { assertReachableUrl } from '../outsideTools/netGuard.js';
import { publicToolName } from '../outsideTools/toolNames.js';
import { splitCommandLine } from '../outsideTools/commandLine.js';

const AGENT_ID = /^[A-Za-z0-9._-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_ENV = /^[A-Z][A-Z0-9_]{0,63}$/;

export function serverView(row, grantedAgents = []) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    transport: row.transport,
    address: row.transport === 'stdio' ? [row.command, ...(row.args || [])].join(' ') : row.url,
    hasKey: Boolean(row.has_secret),
    keyEnv: row.secret_env || null,
    enabled: Boolean(row.enabled),
    tools: (row.tools || []).map((t) => ({ name: t.name, description: t.description, modelName: publicToolName(row.slug, t.name) })),
    lastCheckedAt: row.last_checked_at,
    lastError: row.last_error,
    agents: grantedAgents,
  };
}

function callView(row) {
  return {
    id: String(row.id), server: row.server_name, tool: row.tool, origin: row.origin, ok: row.ok,
    durationMs: row.duration_ms, error: row.error, at: row.created_at,
  };
}

export function createOutsideToolsRouter({ db = pool, isReady = dbReady, listTools = listServerTools } = {}) {
  const router = express.Router();
  const userOf = (req) => req.session?.userId;

  router.use((req, res, next) => {
    if (!isReady()) return res.status(503).json({ error: 'The database is not ready yet.' });
    if (!userOf(req)) return res.status(401).json({ error: 'Sign in first.' });
    return next();
  });

  const fail = (res, error) => res.status(error.statusCode || 500).json({
    error: error.statusCode ? error.message : 'Something went wrong.',
  });

  async function owned(req) {
    if (!UUID.test(String(req.params.id))) throw new store.OutsideToolStoreError('No tool server with that id.', 404);
    const server = await store.getServer(db, { userId: userOf(req), serverId: String(req.params.id) });
    if (!server) throw new store.OutsideToolStoreError('No tool server with that id.', 404);
    return server;
  }

  /** Connect, list the tools, and save what happened. Never throws. */
  async function check(userId, server) {
    try {
      const secret = await store.readSecret(db, { userId, server });
      const tools = await listTools(server, secret);
      return await store.saveCheck(db, { userId, serverId: server.id, tools });
    } catch (error) {
      forget(server.id);
      return store.saveCheck(db, { userId, serverId: server.id, error: error.message || 'Could not reach it.' });
    }
  }

  async function overview(req) {
    const userId = userOf(req);
    const agentId = AGENT_ID.test(String(req.query.agentId || '')) ? String(req.query.agentId) : null;
    const [servers, grants, calls] = await Promise.all([
      store.listServers(db, { userId }),
      store.grantsFor(db, { userId }),
      agentId ? store.recentCalls(db, { userId, agentId }) : [],
    ]);
    const agentsOf = (id) => grants.filter((g) => g.server_id === id).map((g) => g.agent_id);
    return {
      servers: servers.map((row) => serverView(row, agentsOf(row.id))),
      calls: calls.map(callView),
      programsAllowed: localFilesystemAllowed(),
    };
  }

  router.get('/', async (req, res) => {
    try { return res.json(await overview(req)); } catch (error) { return fail(res, error); }
  });

  router.post('/', async (req, res) => {
    try {
      const userId = userOf(req);
      const body = req.body || {};
      const transport = body.transport === 'stdio' ? 'stdio' : 'http';
      const input = { userId, name: body.name, transport };
      if (transport === 'stdio') {
        if (!localFilesystemAllowed()) {
          throw new store.OutsideToolStoreError('Tool programs only run in the censaiOS desktop app. Use a web address here.', 403);
        }
        await assertSystemAdmin(req, { db });
        const parts = splitCommandLine(body.command);
        if (!parts.length) throw new store.OutsideToolStoreError('Type the command that starts the tool server.');
        const keyEnv = String(body.keyEnv || '').trim().toUpperCase();
        if (keyEnv && !SECRET_ENV.test(keyEnv)) throw new store.OutsideToolStoreError('The key name may only use letters, digits and _.');
        Object.assign(input, { command: parts[0], args: parts.slice(1, 40), secretEnv: keyEnv || null });
      } else {
        input.url = (await assertReachableUrl(body.url)).toString();
      }
      let server = await store.createServer(db, input);
      if (body.key) {
        await store.saveSecret(db, { userId, serverId: server.id, secret: body.key });
        server = await store.getServer(db, { userId, serverId: server.id });
      }
      await check(userId, server);
      return res.status(201).json(await overview(req));
    } catch (error) { return fail(res, error); }
  });

  router.post('/:id/check', async (req, res) => {
    try {
      const server = await owned(req);
      forget(server.id);
      await check(userOf(req), server);
      return res.json(await overview(req));
    } catch (error) { return fail(res, error); }
  });

  router.patch('/:id', async (req, res) => {
    try {
      await owned(req);
      if (typeof req.body?.enabled !== 'boolean') throw new store.OutsideToolStoreError('Say whether the server is on or off.');
      await store.setEnabled(db, { userId: userOf(req), serverId: String(req.params.id), enabled: req.body.enabled });
      if (!req.body.enabled) forget(String(req.params.id));
      return res.json(await overview(req));
    } catch (error) { return fail(res, error); }
  });

  router.put('/:id/key', async (req, res) => {
    try {
      const server = await owned(req);
      await store.saveSecret(db, { userId: userOf(req), serverId: server.id, secret: req.body?.key });
      forget(server.id);
      await check(userOf(req), await store.getServer(db, { userId: userOf(req), serverId: server.id }));
      return res.json(await overview(req));
    } catch (error) { return fail(res, error); }
  });

  router.put('/:id/agents/:agentId', async (req, res) => {
    try {
      await owned(req);
      if (!AGENT_ID.test(String(req.params.agentId))) throw new store.OutsideToolStoreError('Pick an agent.');
      if (typeof req.body?.allowed !== 'boolean') throw new store.OutsideToolStoreError('Say whether the agent may use it.');
      await store.setGrant(db, {
        userId: userOf(req), serverId: String(req.params.id), agentId: String(req.params.agentId), allowed: req.body.allowed,
      });
      return res.json(await overview(req));
    } catch (error) { return fail(res, error); }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const server = await owned(req);
      forget(server.id);
      await store.deleteServer(db, { userId: userOf(req), serverId: server.id });
      return res.json(await overview(req));
    } catch (error) { return fail(res, error); }
  });

  return router;
}

export const outsideToolsRouter = createOutsideToolsRouter();
