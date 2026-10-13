// server/agentEndpoints/mcpProtocol.js
//
// The Model Context Protocol, Streamable HTTP transport, stateless: each
// POST carries one JSON-RPC message and gets one JSON reply (the spec lets a
// server answer with application/json instead of an SSE stream). No session
// ids, so the same address works behind a tunnel or a future hosted relay.
// Each shared agent appears as one tool, "ask_<name>".

export const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze(['2025-11-25', '2025-06-18', '2025-03-26']);
export const SERVER_INFO = Object.freeze({ name: 'censaiOS', title: 'censaiOS agents', version: '1.0.0' });

const RPC = { parse: -32700, invalidRequest: -32600, method: -32601, params: -32602 };

export function toolNameFor(agentName) {
  const slug = String(agentName || 'agent').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);
  return `ask_${slug || 'agent'}`;
}

export function agentTool(endpoint) {
  const name = endpoint.agent_name;
  return {
    name: toolNameFor(name),
    title: `Ask ${name}`,
    description: [
      `Ask ${name}, an agent on a censaiOS board (registry card ${endpoint.card_id}).`,
      `${name} answers with its own model, memory and look-up tools, and the exchange shows up in its chat on the owner's board.`,
      'Send the whole question with any context it needs; each call is answered on its own.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string', description: `What to ask ${name}.` } },
      required: ['message'],
      additionalProperties: false,
    },
  };
}

function result(id, value) { return { jsonrpc: '2.0', id, result: value }; }
function failure(id, code, message) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }; }

/**
 * Handle one JSON-RPC message. Returns { status, body } where body is null
 * for notifications and responses (HTTP 202, no body).
 *   ask(question) -> Promise<{ answer }>, throws an Error with a message
 */
export async function handleMcpMessage(message, { endpoint, ask }) {
  if (Array.isArray(message)) {
    return { status: 400, body: failure(null, RPC.invalidRequest, 'Send one JSON-RPC message per request.') };
  }
  if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') {
    return { status: 400, body: failure(null, RPC.invalidRequest, 'Not a JSON-RPC 2.0 message.') };
  }
  const { id, method, params = {} } = message;
  if (id === undefined || id === null) {
    // A notification (e.g. notifications/initialized) or a client response.
    return { status: 202, body: null };
  }
  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      return {
        status: 200,
        body: result(id, {
          protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(asked) ? asked : SUPPORTED_PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: `Use ${toolNameFor(endpoint.agent_name)} to ask ${endpoint.agent_name}, a censaiOS agent, for help.`,
        }),
      };
    }
    case 'ping':
      return { status: 200, body: result(id, {}) };
    case 'tools/list':
      return { status: 200, body: result(id, { tools: [agentTool(endpoint)] }) };
    case 'tools/call': {
      if (params?.name !== toolNameFor(endpoint.agent_name)) {
        return { status: 200, body: failure(id, RPC.params, `Unknown tool: ${String(params?.name || '')}`) };
      }
      try {
        const { answer } = await ask(params?.arguments?.message);
        return { status: 200, body: result(id, { content: [{ type: 'text', text: answer }], isError: false }) };
      } catch (error) {
        // Tool failures are results the model can read, not protocol errors.
        return { status: 200, body: result(id, { content: [{ type: 'text', text: error.message }], isError: true }) };
      }
    }
    default:
      return { status: 200, body: failure(id, RPC.method, `Method not found: ${String(method)}`) };
  }
}

export const RPC_ERRORS = RPC;
