// server/agentNetwork/receipts.js
//
// Agent receipts: one signed slip per help request, per side. Pure code, no
// database. A receipt is { body, signature }:
//   body       who asked, who answered, which agent card, when, tokens,
//              money when the card has a price, SHA-256 of the question and
//              of the answer (never their text), and the signer's install
//              id and public key
//   signature  Ed25519 over canonicalJson(body) by that install
// The asking install keeps its own receipt plus the helper install's
// signed receipt, and the other way round, so both sides hold proof the
// other side cannot rewrite.

import crypto from 'node:crypto';
import { canonicalJson, sha256Hex } from './canonical.js';
import { installIdFor, verifySignature } from './installIdentity.js';

export const RECEIPT_KIND = 'censai.agent-receipt';
export const RECEIPT_VERSION = 1;
export const ROLES = Object.freeze(['asker', 'helper', 'both']);
export const CHANNELS = Object.freeze(['board', 'endpoint', 'relay']);

const MAX_LABEL = 80;

function label(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, MAX_LABEL) : null;
}

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function count(value) {
  const n = Math.round(Number(value) || 0);
  return n > 0 ? n : 0;
}

/** Add up the token counts the run engine wrote on each model call. */
export function tokensFromTimings(timings) {
  const calls = Array.isArray(timings?.model_calls) ? timings.model_calls : [];
  return calls.reduce((sum, call) => ({
    tokensIn: sum.tokensIn + count(call?.tokens_in),
    tokensOut: sum.tokensOut + count(call?.tokens_out),
  }), { tokensIn: 0, tokensOut: 0 });
}

/** A card's per-call price, when it has one ({ cents, currency } or null). */
export function cardPrice(card) {
  const market = card?.metadata?.marketplace || card?.marketplace || {};
  const cents = Number(market.priceCents);
  if (!Number.isFinite(cents) || cents <= 0) return null;
  return { cents: Math.round(cents), currency: String(market.currency || 'USD').toUpperCase().slice(0, 3) };
}

/**
 * Build the unsigned body. Every field is plain data so the same bytes come
 * out on any install.
 */
export function buildReceiptBody({
  id = crypto.randomUUID(), role, channel, requestRef, signer,
  asker = {}, helper = {}, outcome, startedAt, finishedAt,
  tokensIn = 0, tokensOut = 0, price = null, prompt, answer,
}) {
  if (!ROLES.includes(role)) throw new Error(`Unknown receipt role: ${role}`);
  if (!CHANNELS.includes(channel)) throw new Error(`Unknown receipt channel: ${channel}`);
  const started = iso(startedAt);
  const finished = iso(finishedAt);
  return {
    kind: RECEIPT_KIND,
    v: RECEIPT_VERSION,
    id,
    role,
    channel,
    request: String(requestRef),
    asker: {
      install: asker.install || signer.installId,
      agent: label(asker.agent),
      label: label(asker.label),
      ...(asker.verified !== undefined ? { verified: Boolean(asker.verified) } : {}),
    },
    helper: {
      install: helper.install || signer.installId,
      card: helper.card ? String(helper.card) : null,
      label: label(helper.label),
    },
    outcome: outcome === 'completed' ? 'completed' : 'failed',
    startedAt: started,
    finishedAt: finished,
    durationMs: started && finished ? Math.max(0, Date.parse(finished) - Date.parse(started)) : null,
    cost: {
      tokensIn: count(tokensIn),
      tokensOut: count(tokensOut),
      price: price ? { cents: price.cents, currency: price.currency } : null,
    },
    promptSha256: sha256Hex(prompt),
    answerSha256: answer == null ? null : sha256Hex(answer),
    signer: { install: signer.installId, publicKey: signer.publicKey },
  };
}

export function signReceipt(body, signer) {
  return { body, signature: signer.sign(canonicalJson(body)) };
}

/**
 * Check a receipt from anywhere: the shape, that the install id matches the
 * public key, and the signature. Returns { ok, reason }.
 */
export function verifyReceipt(receipt) {
  const body = receipt?.body;
  if (!body || typeof body !== 'object' || body.kind !== RECEIPT_KIND) return { ok: false, reason: 'not a receipt' };
  const signer = body.signer || {};
  if (!signer.publicKey || installIdFor(signer.publicKey) !== signer.install) {
    return { ok: false, reason: 'install id does not match its key' };
  }
  if (!verifySignature(canonicalJson(body), receipt.signature, signer.publicKey)) {
    return { ok: false, reason: 'signature does not match' };
  }
  return { ok: true, reason: null };
}

/** Does a helper's receipt really cover this question and this answer? */
export function receiptCovers(receipt, { prompt, answer }) {
  const body = receipt?.body || {};
  if (prompt !== undefined && body.promptSha256 !== sha256Hex(prompt)) return false;
  if (answer !== undefined && body.answerSha256 !== sha256Hex(answer)) return false;
  return true;
}

/** The small summary a chat message or help card carries. */
export function receiptSummary(receipt, { verified = null, counterVerified = null } = {}) {
  const body = receipt?.body;
  if (!body) return null;
  return {
    id: body.id,
    role: body.role,
    channel: body.channel,
    outcome: body.outcome,
    durationMs: body.durationMs,
    tokens: (body.cost?.tokensIn || 0) + (body.cost?.tokensOut || 0),
    price: body.cost?.price || null,
    signedBy: body.signer?.install || null,
    verified: verified ?? verifyReceipt(receipt).ok,
    ...(counterVerified !== null ? { counterVerified } : {}),
  };
}
