// server/agentNetwork/askRequest.js
//
// When a censaiOS agent asks an agent on another censaiOS, the asking
// install signs who is asking and a hash of the question. The helping
// install checks it and records the asker in its receipt as verified, so
// its receipt says "Nexus on install ci_..." instead of just a key name.
// The agent key still decides whether the call is allowed; this only
// proves who asked.

import { canonicalJson, sha256Hex } from './canonical.js';
import { installIdFor, verifySignature } from './installIdentity.js';

export const REQUEST_KIND = 'censai.agent-request';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function buildAskRequest({ signer, id, agent = null, label = null, to, prompt, now = new Date() }) {
  const body = {
    kind: REQUEST_KIND,
    v: 1,
    id: String(id),
    from: { install: signer.installId, publicKey: signer.publicKey, agent, label },
    to: String(to),
    promptSha256: sha256Hex(prompt),
    at: now.toISOString(),
  };
  return { body, signature: signer.sign(canonicalJson(body)) };
}

/**
 * Check a signed ask request against the question that came with it.
 * Returns { ok, reason, install, agent, label, id }. Callers treat a bad
 * one as "unverified", never as a reason to refuse a call with a good key.
 */
export function verifyAskRequest(request, { prompt, now = Date.now() }) {
  const body = request?.body;
  if (!body || body.kind !== REQUEST_KIND) return { ok: false, reason: 'no signed request' };
  const from = body.from || {};
  if (!from.publicKey || installIdFor(from.publicKey) !== from.install) return { ok: false, reason: 'install id does not match its key' };
  if (body.promptSha256 !== sha256Hex(prompt)) return { ok: false, reason: 'signed for a different question' };
  const at = Date.parse(body.at);
  if (!Number.isFinite(at) || Math.abs(now - at) > MAX_AGE_MS) return { ok: false, reason: 'request too old' };
  if (!verifySignature(canonicalJson(body), request.signature, from.publicKey)) return { ok: false, reason: 'signature does not match' };
  return {
    ok: true, reason: null, install: from.install, id: String(body.id).slice(0, 100),
    agent: from.agent ? String(from.agent).slice(0, 80) : null,
    label: from.label ? String(from.label).slice(0, 80) : null,
  };
}
