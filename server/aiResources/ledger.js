// The AI resources ledger: what censaiOS itself has spent through each key.
//
// One small JSON file in the state folder (.homebase-state/ai-resources.json),
// no database table. Per key it keeps running totals, the starting amount or
// budget its holder typed, and one row per thing that spent on it (an agent,
// a chat window, a feature such as LeadHound) with the account that ran it.
// It never holds a key: only the fingerprint and last four characters
// (keyIdentity.js). Writes are batched and flushed a moment later.

import fs from 'fs';
import path from 'path';
import { createLogger } from '../logger.js';

const log = createLogger('ai-resources');

const FILE_NAME = 'ai-resources.json';
const MAX_KEYS = 500;
const MAX_CONSUMERS = 200;
const FLUSH_MS = 2000;

let state = null;
let timer = null;
let exitHooked = false;

function stateDir(env = process.env) {
  return env.HOMEBASE_STATE_DIR || path.resolve(process.cwd(), '.homebase-state');
}

function filePath() {
  return path.join(stateDir(), FILE_NAME);
}

function load() {
  if (state) return state;
  if (!exitHooked) {
    exitHooked = true;
    process.once('exit', () => { try { flushLedger(); } catch { /* shutting down */ } });
  }
  let text = null;
  try { text = fs.readFileSync(filePath(), 'utf8'); } catch { /* first run: no file yet */ }
  try {
    const raw = text == null ? {} : JSON.parse(text);
    state = { since: raw.since || new Date().toISOString(), keys: raw.keys && typeof raw.keys === 'object' ? raw.keys : {} };
  } catch {
    // A damaged file is kept aside, never overwritten, so typed amounts can be recovered.
    try { fs.renameSync(filePath(), `${filePath()}.damaged-${Date.now()}`); } catch { /* best effort */ }
    log.warn('ledger file was damaged; kept it aside and started a new one');
    state = { since: new Date().toISOString(), keys: {} };
  }
  return state;
}

export function flushLedger() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!state) return;
  fs.mkdirSync(stateDir(), { recursive: true });
  // Write a copy, then swap it in, so a crash mid-write never leaves half a file.
  const temp = `${filePath()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(temp, filePath());
}

function scheduleFlush() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try { flushLedger(); } catch { /* the next write tries again */ }
  }, FLUSH_MS);
  timer.unref?.();
}

const emptyTotals = () => ({ calls: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, unpriced: 0 });

function ensureKey(ledger, { keyId, provider, last4 }) {
  return ledger.keys[keyId] || (ledger.keys[keyId] = { provider, last4, budgetUsd: null, totals: emptyTotals(), consumers: {} });
}

function addTo(totals, { tokensIn, tokensOut, costUsd }) {
  totals.calls += 1;
  totals.tokensIn += tokensIn;
  totals.tokensOut += tokensOut;
  if (costUsd == null) totals.unpriced += 1;
  else totals.costUsd += costUsd;
}

function trim(map, max) {
  const entries = Object.entries(map);
  if (entries.length <= max) return;
  entries.sort((a, b) => String(a[1].lastAt).localeCompare(String(b[1].lastAt)));
  for (const [id] of entries.slice(0, entries.length - max)) delete map[id];
}

/** Adds one metered call. `consumer` is { id, kind, ref, userId, agentId?, allowance? }. */
export function recordSpend({ keyId, provider, last4, model, tokensIn = 0, tokensOut = 0, costUsd = null, consumer }) {
  const ledger = load();
  const now = new Date().toISOString();
  const key = ensureKey(ledger, { keyId, provider, last4 });
  const call = { tokensIn: Number(tokensIn) || 0, tokensOut: Number(tokensOut) || 0, costUsd };
  addTo(key.totals, call);
  key.lastAt = now;
  key.lastModel = model || key.lastModel || null;
  const row = key.consumers[consumer.id] || (key.consumers[consumer.id] = { ...consumer, ...emptyTotals() });
  addTo(row, call);
  row.lastAt = now;
  row.model = model || row.model || null;
  trim(key.consumers, MAX_CONSUMERS);
  trim(ledger.keys, MAX_KEYS);
  scheduleFlush();
}

/** The starting amount or budget a key's holder typed (null clears it). */
export function setBudget({ keyId, provider, last4, budgetUsd }) {
  const key = ensureKey(load(), { keyId, provider, last4 });
  key.budgetUsd = budgetUsd;
  key.budgetSetAt = new Date().toISOString();
  // "Left" counts what was spent after the amount was typed in.
  key.spentAtBudget = key.totals.costUsd;
  flushLedger();
  return key;
}

/** Keeps the provider's own answer (for example OpenRouter's credits left). */
export function setProviderReading({ keyId, provider, last4 }, reading) {
  const key = ensureKey(load(), { keyId, provider, last4 });
  key.providerReading = { ...reading, at: new Date().toISOString() };
  scheduleFlush();
  return key.providerReading;
}

export function ledgerKey(keyId) {
  return load().keys[keyId] || null;
}

export function ledgerKeys() {
  return load().keys;
}

export function ledgerSince() {
  return load().since;
}

/** Tests only: forget what is in memory so the next read comes from disk. */
export function resetLedgerForTests() {
  if (timer) clearTimeout(timer);
  timer = null;
  state = null;
}
