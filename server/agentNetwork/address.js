// server/agentNetwork/address.js
//
// The address of a shared agent. Two forms, same path after the host:
//   direct  https://<host>/api/mcp/agents/<endpoint id>
//   relay   https://<relay>/i/<install id>/api/mcp/agents/<endpoint id>
// The relay form names the install (a fingerprint of its signing key), so
// a relay can forward the call when that install is online and queue it
// when it is not. The agent key travels unchanged in both forms and is
// only ever checked by the install itself, never by the relay.
// Append "/ask" for the plain HTTP form ({ message } -> { answer }).

import { isInstallId } from './installIdentity.js';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PATH = new RegExp(`^(?:/i/(ci_[0-9a-f]{24}))?/api/mcp/agents/(${UUID})(?:/ask)?/?$`, 'i');

export class AgentAddressError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 422;
    this.code = 'AGENT_ADDRESS_INVALID';
  }
}

/** Parse either form. Returns { origin, installId, endpointId, viaRelay, mcpUrl, askUrl }. */
export function parseAgentAddress(input) {
  let url;
  try { url = new URL(String(input || '').trim()); } catch {
    throw new AgentAddressError('That is not a web address. Copy the agent address from its Share panel.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new AgentAddressError('Agent addresses start with https:// (or http:// on this computer).');
  }
  const match = PATH.exec(url.pathname);
  if (!match) {
    throw new AgentAddressError('That address does not point at a censaiOS agent. It should end in /api/mcp/agents/<id>.');
  }
  const installId = match[1] ? match[1].toLowerCase() : null;
  const endpointId = match[2].toLowerCase();
  const base = `${url.origin}${installId ? `/i/${installId}` : ''}/api/mcp/agents/${endpointId}`;
  return { origin: url.origin, installId, endpointId, viaRelay: Boolean(installId), mcpUrl: base, askUrl: `${base}/ask` };
}

/** The relay form of an agent's address. */
export function relayAgentAddress({ relayUrl, installId, endpointId }) {
  if (!isInstallId(installId)) throw new AgentAddressError('Unknown install id.');
  const origin = new URL(String(relayUrl)).origin;
  return `${origin}/i/${installId}/api/mcp/agents/${endpointId}`;
}
