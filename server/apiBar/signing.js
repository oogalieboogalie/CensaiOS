// server/apiBar/signing.js
//
// The bar signs every answer it carries back with this install's Ed25519
// key (the same key that signs agent-to-agent receipts), so a caller can
// prove the answer came from this censaiOS and was not changed on the way.
// Every agent reached through the bar also gets an ID card: a fingerprint of
// this install and the agent's address, so one agent cannot pass itself off
// as another. Anyone can check a signature with the public key alone.

import { canonicalJson, sha256Hex } from '../agentNetwork/canonical.js';
import { installIdFor, verifySignature } from '../agentNetwork/installIdentity.js';

export const SIGNED_KIND = 'censai.api-bar-answer';
export const SIGNED_VERSION = 1;

/** "ag_" + 24 hex: the same agent on the same install always gets the same card. */
export function agentIdentity(installId, endpointId) {
  return `ag_${sha256Hex(`${installId}:agent:${endpointId}`).slice(0, 24)}`;
}

/** What gets signed: the answer's fingerprint, never the answer itself. */
export function signedBody({ installId, branch, action, status, answer, agent = null, at }) {
  return {
    kind: SIGNED_KIND,
    v: SIGNED_VERSION,
    install_id: installId,
    branch,
    action,
    status,
    answer_sha256: sha256Hex(canonicalJson(answer ?? null)),
    ...(agent ? { agent } : {}),
    at,
  };
}

/** Sign one answer. Returns the stamp the bar attaches, or null without a signer. */
export function stampAnswer(signer, { branch, action, status, answer, agent = null, now = new Date() }) {
  if (!signer) return null;
  const body = signedBody({ installId: signer.installId, branch, action, status, answer, agent, at: now.toISOString() });
  return { ...body, public_key: signer.publicKey, signature: signer.sign(canonicalJson(body)) };
}

/** True when the stamp is genuine and matches this answer. */
export function checkStamp(stamp, answer) {
  if (!stamp || typeof stamp !== 'object') return false;
  const { public_key: publicKey, signature, ...body } = stamp;
  if (installIdFor(publicKey) !== body.install_id) return false;
  if (body.answer_sha256 !== sha256Hex(canonicalJson(answer ?? null))) return false;
  return verifySignature(canonicalJson(body), signature, publicKey);
}
