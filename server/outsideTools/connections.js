// server/outsideTools/connections.js
//
// Keeps one live connection per outside tool server so an agent calling three
// tools in a row does not start a program or a session three times. A
// connection closes after five quiet minutes, and is replaced when the user
// edits the server (its updated_at changes).

import { createHttpClient, OutsideToolError } from './httpClient.js';
import { createStdioClient } from './stdioClient.js';
import { reachableFetch } from './netGuard.js';

const IDLE_MS = 5 * 60 * 1000;
const MAX_RESULT_CHARS = 20000;
const live = new Map();
let sweeper = null;

function fingerprint(server) {
  return `${server.updated_at ? new Date(server.updated_at).getTime() : 0}`;
}

export function makeClient(server, secret, fetchImpl) {
  if (server.transport === 'stdio') {
    return createStdioClient({
      command: server.command, args: server.args || [], secret, secretEnv: server.secret_env || '',
    });
  }
  return createHttpClient({ url: server.url, secret, ...(fetchImpl ? { fetchImpl } : {}) });
}

function sweep() {
  const now = Date.now();
  for (const [id, entry] of live) {
    if (now - entry.lastUsed > IDLE_MS) { entry.client.close(); live.delete(id); }
  }
  if (live.size === 0 && sweeper) { clearInterval(sweeper); sweeper = null; }
}

async function connection(server, secret) {
  const existing = live.get(server.id);
  if (existing && existing.fingerprint === fingerprint(server)) {
    existing.lastUsed = Date.now();
    await existing.ready;
    return existing.client;
  }
  if (existing) { existing.client.close(); live.delete(server.id); }
  const pinned = server.transport === 'stdio' ? null : (await reachableFetch(server.url)).fetchImpl;
  const client = makeClient(server, secret, pinned);
  const entry = { client, ready: client.connect(), lastUsed: Date.now(), fingerprint: fingerprint(server) };
  live.set(server.id, entry);
  if (!sweeper) { sweeper = setInterval(sweep, 60 * 1000); sweeper.unref?.(); }
  try {
    await entry.ready;
  } catch (error) {
    client.close();
    live.delete(server.id);
    throw error;
  }
  return client;
}

/** Run fn(client) against the server, reconnecting once if the session expired. */
export async function withServer(server, secret, fn) {
  try {
    return await fn(await connection(server, secret));
  } catch (error) {
    if (!error?.sessionExpired) throw error;
    forget(server.id);
    return fn(await connection(server, secret));
  }
}

export function forget(serverId) {
  const entry = live.get(serverId);
  if (entry) { entry.client.close(); live.delete(serverId); }
}

export function closeAll() {
  for (const id of [...live.keys()]) forget(id);
}

/** The tools a server offers, trimmed to what a model needs. */
export async function listServerTools(server, secret) {
  const tools = [];
  await withServer(server, secret, async (client) => {
    let cursor;
    for (let page = 0; page < 10; page += 1) {
      const result = await client.request('tools/list', cursor ? { cursor } : {});
      for (const tool of result.tools || []) {
        if (!tool?.name) continue;
        tools.push({
          name: String(tool.name).slice(0, 128),
          description: String(tool.description || tool.title || '').slice(0, 1000),
          inputSchema: tool.inputSchema && typeof tool.inputSchema === 'object'
            ? tool.inputSchema : { type: 'object', properties: {} },
        });
      }
      cursor = result.nextCursor;
      if (!cursor) break;
    }
  });
  return tools.slice(0, 100);
}

/** MCP content blocks as one text the model can read. */
export function resultText(result) {
  const parts = [];
  for (const block of result?.content || []) {
    if (block?.type === 'text') parts.push(block.text);
    else if (block?.type === 'resource' && block.resource?.text) parts.push(block.resource.text);
    else if (block?.type) parts.push(`[${block.type} returned, not shown]`);
  }
  if (!parts.length && result?.structuredContent) parts.push(JSON.stringify(result.structuredContent));
  const text = parts.join('\n').trim() || '(the tool returned nothing)';
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}…` : text;
}

export async function callServerTool(server, secret, toolName, args) {
  const result = await withServer(server, secret,
    (client) => client.request('tools/call', { name: toolName, arguments: args || {} }));
  const text = resultText(result);
  if (result?.isError) throw new OutsideToolError(`The tool reported a problem: ${text.slice(0, 500)}`, 400);
  return text;
}
