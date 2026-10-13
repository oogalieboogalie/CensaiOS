// server/outsideTools/httpClient.js
//
// The client half of MCP's Streamable HTTP transport: censaiOS talking to an
// outside MCP server by its web address. Each JSON-RPC request is one POST;
// the server answers with plain JSON or with a short event stream holding
// the reply. A session id the server hands out is sent back on every call.
// No SDK dependency, the same way server/agentEndpoints/mcpProtocol.js is
// hand-written for the other direction.

export const CLIENT_PROTOCOL_VERSION = '2025-06-18';
export const CLIENT_INFO = Object.freeze({ name: 'censaiOS', version: '1.0.0' });
const DEFAULT_TIMEOUT_MS = 30 * 1000;
const MAX_BODY_CHARS = 2 * 1024 * 1024;

export class OutsideToolError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.statusCode = statusCode;
  }
}

/** Pull the JSON-RPC reply with this id out of an SSE body. */
export function replyFromEventStream(text, id) {
  for (const block of String(text).split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n');
    if (!data) continue;
    let message;
    try { message = JSON.parse(data); } catch { continue; }
    const list = Array.isArray(message) ? message : [message];
    const match = list.find((m) => m && m.id === id && ('result' in m || 'error' in m));
    if (match) return match;
  }
  return null;
}

export function unwrapReply(reply) {
  if (!reply) throw new OutsideToolError('The tool server sent no answer.');
  if (reply.error) {
    throw new OutsideToolError(`The tool server said: ${String(reply.error.message || 'error').slice(0, 300)}`);
  }
  return reply.result ?? {};
}

export function createHttpClient({ url, secret = '', fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  let sessionId = null;
  let protocolVersion = null;
  let nextId = 1;

  async function post(message) {
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    if (secret) headers.authorization = /^(bearer|basic|token)\s/i.test(secret) ? secret : `Bearer ${secret}`;
    if (sessionId) headers['mcp-session-id'] = sessionId;
    if (protocolVersion) headers['mcp-protocol-version'] = protocolVersion;
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST', headers, body: JSON.stringify(message), signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const why = error?.name === 'TimeoutError' ? 'it took too long to answer' : 'it could not be reached';
      throw new OutsideToolError(`The tool server at ${url} did not answer: ${why}.`);
    }
    const sid = res.headers.get('mcp-session-id');
    if (sid) sessionId = sid;
    if (res.status === 401 || res.status === 403) {
      throw new OutsideToolError('The tool server turned the key down. Check the key saved for it.', 400);
    }
    if (res.status === 404 && sessionId && message.method !== 'initialize') {
      sessionId = null;
      throw Object.assign(new OutsideToolError('The tool server forgot this session.'), { sessionExpired: true });
    }
    if (!res.ok && res.status !== 202) {
      throw new OutsideToolError(`The tool server answered with error ${res.status}.`);
    }
    if (!('id' in message)) return null;
    const type = res.headers.get('content-type') || '';
    const body = (await res.text()).slice(0, MAX_BODY_CHARS);
    if (type.includes('text/event-stream')) return unwrapReply(replyFromEventStream(body, message.id));
    let parsed;
    try { parsed = JSON.parse(body); } catch { throw new OutsideToolError('The tool server sent something that is not MCP.'); }
    const reply = Array.isArray(parsed) ? parsed.find((m) => m?.id === message.id) : parsed;
    return unwrapReply(reply);
  }

  const request = (method, params) => post({ jsonrpc: '2.0', id: nextId++, method, params });

  return {
    async connect() {
      const result = await request('initialize', {
        protocolVersion: CLIENT_PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO,
      });
      protocolVersion = result.protocolVersion || CLIENT_PROTOCOL_VERSION;
      await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
      return result;
    },
    request,
    close() {
      if (!sessionId) return;
      const headers = { 'mcp-session-id': sessionId };
      sessionId = null;
      fetchImpl(url, { method: 'DELETE', headers, signal: AbortSignal.timeout(5000) }).catch(() => {});
    },
  };
}
