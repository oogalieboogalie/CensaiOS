// server/ws/registryHub.js
//
// In-memory pub/sub keyed by agent_cards.id. The hub is the fan-out
// point between:
//   - the WS endpoint (server/ws/agentRegistry.js) — accepts
//     subscribe / unsubscribe / call messages from clients
//   - the invoke path (server/routes/agentRegistry/invoke.js) — when a
//     task emits events, the WS endpoint fans them out to subscribers
//
// The hub is intentionally a single in-process Map. There is no
// persistence: process restart drops all subscribers, which matches
// the brief's "A2A-style task delegation" semantics (subscribers are
// always transient).
//
// Bounded LRU prevents memory leaks:
//   - max 10,000 concurrent (cardId, clientId) subscriptions
//   - 1-hour idle TTL — if a subscriber has not received any traffic
//     for an hour, it is dropped silently (the underlying WS will
//     detect the drop on its next heartbeat / write attempt)
//   - When the LRU evicts, the entry is also removed from the per-card
//     fan-out index so subsequent publishes do not waste cycles on a
//     closed socket.

import { LRUCache } from 'lru-cache';
import { createLogger } from '../logger.js';

const log = createLogger('registry-hub');

const MAX_SUBSCRIPTIONS = 10_000;
const SUBSCRIPTION_TTL_MS = 60 * 60 * 1000; // 1 hour

// Keyed by `${cardId}\u0000${clientId}` to keep a single LRU rather
// than nested structures. Null-byte separator is illegal in our
// cardIds (`agent:*` / `ext:*:*`) and in our clientIds (uuid/cuid).
const cache = new LRUCache({
  max: MAX_SUBSCRIPTIONS,
  ttl: SUBSCRIPTION_TTL_MS,
  ttlAutopurge: false,
  updateAgeOnGet: false,
});

// Per-card fan-out index. Maps cardId -> Set<key>. Maintained in
// parallel with `cache` so publish() is O(subscribers) rather than
// O(total subscriptions).
const byCard = new Map();

function makeKey(cardId, clientId) {
  return `${cardId}\u0000${clientId}`;
}

function parseKey(key) {
  const idx = key.indexOf('\u0000');
  if (idx < 0) return null;
  return { cardId: key.slice(0, idx), clientId: key.slice(1 + idx) };
}

/**
 * Register a subscriber for `cardId`. The `sendFn` is invoked with
 * a JSON-serialisable event object. Returns `true` on success or
 * `false` if the registration would exceed the LRU bound (the
 * caller should reject the subscribe message with a rate-limit error).
 *
 * If a subscriber with the same (cardId, clientId) already exists, the
 * previous sendFn is replaced. This is the natural semantic for a
 * reconnecting client.
 */
export function subscribe(cardId, clientId, sendFn) {
  if (typeof cardId !== 'string' || !cardId) {
    throw new TypeError('subscribe requires non-empty cardId');
  }
  if (typeof clientId !== 'string' || !clientId) {
    throw new TypeError('subscribe requires non-empty clientId');
  }
  if (typeof sendFn !== 'function') {
    throw new TypeError('subscribe requires sendFn');
  }
  const key = makeKey(cardId, clientId);
  cache.set(key, { cardId, clientId, sendFn });
  let bucket = byCard.get(cardId);
  if (!bucket) {
    bucket = new Set();
    byCard.set(cardId, bucket);
  }
  bucket.add(key);
  return true;
}

/**
 * Remove a subscriber. Idempotent: returns `true` if a subscriber was
 * removed, `false` if there was no matching entry. When the last
 * subscriber for a cardId leaves, the per-card index entry is also
 * dropped so the hub does not accumulate empty buckets.
 */
export function unsubscribe(cardId, clientId) {
  if (!cardId || !clientId) return false;
  const key = makeKey(cardId, clientId);
  const existed = cache.delete(key);
  const bucket = byCard.get(cardId);
  if (bucket) {
    bucket.delete(key);
    if (bucket.size === 0) byCard.delete(cardId);
  }
  return existed;
}

/**
 * Fan out an event to every subscriber for `cardId`. Returns the
 * number of subscribers the event was delivered to. Failures in any
 * individual subscriber's sendFn are logged but do not interrupt the
 * fan-out — a misbehaving subscriber should not block the rest.
 */
export function publish(cardId, event) {
  if (!cardId || event === undefined || event === null) return 0;
  const bucket = byCard.get(cardId);
  if (!bucket || bucket.size === 0) return 0;
  let delivered = 0;
  for (const key of bucket) {
    const entry = cache.get(key);
    if (!entry) continue; // evicted since fan-out index was built
    try {
      entry.sendFn(event);
      delivered += 1;
    } catch (err) {
      log.warn('subscriber send failed', { cardId, clientId: entry.clientId, error: err.message });
    }
  }
  return delivered;
}

/**
 * Diagnostics: list the current subscribers for a cardId. Returns an
 * array of clientIds (no closures leak). Useful for /api/diag-style
 * introspection; not part of the public WS protocol.
 */
export function listSubscribers(cardId) {
  const bucket = byCard.get(cardId);
  if (!bucket) return [];
  const out = [];
  for (const key of bucket) {
    const parsed = parseKey(key);
    if (parsed) out.push(parsed.clientId);
  }
  return out;
}

/**
 * Diagnostics + tests: how many subscriptions are currently tracked
 * across all cards. Bounded by MAX_SUBSCRIPTIONS.
 */
export function subscriptionCount() {
  return cache.size;
}

/**
 * Test-only escape hatch — drops all subscriptions and the per-card
 * index. The hub is process-local; tests reset between cases.
 */
export function __resetHubForTests() {
  cache.clear();
  byCard.clear();
}

export const HUB_LIMITS = Object.freeze({
  maxSubscriptions: MAX_SUBSCRIPTIONS,
  subscriptionTtlMs: SUBSCRIPTION_TTL_MS,
});