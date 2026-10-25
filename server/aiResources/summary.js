// Everything the AI resources window shows for one person, in one answer:
// the keys they hold (masked), what censaiOS spent through each and on
// what, what is left of the amount they typed in, which key each agent
// uses, the coding CLIs' sign-ins, and who the owner shares keys with.

import pool from '../db.js';
import { readKeySharing, isKeySharedWith } from '../security/keySharing.js';
import { getRuntimeMode, RUNTIME_MODES } from '../middleware/runtimeMode.js';
import { assertSystemAdmin } from '../security/systemAdmin.js';
import { createLogger } from '../logger.js';
import { heldKeys } from './holdings.js';
import { ledgerKeys, ledgerSince } from './ledger.js';
import { maskedKey, providerLabel } from './keyIdentity.js';
import { providerAnswersBalance } from './providerBalance.js';
import { agentRoutes } from './agentKeys.js';
import { cliResources } from './cliAccounts.js';

const log = createLogger('ai-resources');

const FEATURE_NAMES = {
  'chat-loop': 'Chat', 'group-chat': 'Group chat', leadhound: 'LeadHound', 'auction-watcher': 'Auction Watcher',
  'nano-helper': 'Agent helper', 'task-worker': 'Background tasks', research: 'Research',
};

export function featureName(source) {
  const id = String(source || '');
  return FEATURE_NAMES[id] || id.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) || 'censaiOS';
}

const round = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

function consumerRow(row, names, agentNames) {
  return {
    kind: row.kind,
    ref: row.ref,
    label: row.kind === 'feature' ? featureName(row.ref) : row.kind === 'agent' ? agentNames.get(row.ref) || 'An agent' : null,
    agentId: row.agentId || null,
    agentName: row.agentId ? agentNames.get(row.agentId) || null : null,
    source: featureName(row.source),
    who: names.get(String(row.userId)) || null,
    allowance: Boolean(row.allowance),
    calls: row.calls, tokensIn: row.tokensIn, tokensOut: row.tokensOut,
    costUsd: round(row.costUsd), unpriced: row.unpriced, model: row.model || null, lastAt: row.lastAt || null,
  };
}

/** One key's card. `rows` are the consumer rows this person may see. */
export function keyCard({ keyId, provider, last4, source, mine, entry, rows, names, agentNames }) {
  const spent = rows.reduce((sum, r) => sum + (Number(r.costUsd) || 0), 0);
  const budget = mine && entry?.budgetUsd != null ? Number(entry.budgetUsd) : null;
  const spentSinceBudget = budget == null ? null : Math.max(0, (entry.totals?.costUsd || 0) - (entry.spentAtBudget || 0));
  const lastSeen = rows.reduce((max, r) => (String(r.lastAt || '') > max ? String(r.lastAt) : max), '');
  return {
    // A key this person does not hold gets no fingerprint, only a row id.
    keyId: mine ? keyId : `other-${rows[0]?.id || provider}`,
    provider,
    providerLabel: providerLabel(provider),
    masked: maskedKey(last4),
    source,
    mine,
    calls: rows.reduce((n, r) => n + r.calls, 0),
    tokensIn: rows.reduce((n, r) => n + r.tokensIn, 0),
    tokensOut: rows.reduce((n, r) => n + r.tokensOut, 0),
    unpriced: rows.reduce((n, r) => n + r.unpriced, 0),
    spentUsd: round(spent),
    budgetUsd: budget,
    budgetSetAt: mine ? entry?.budgetSetAt || null : null,
    leftUsd: budget == null ? null : round(budget - spentSinceBudget),
    providerReading: mine ? entry?.providerReading || null : null,
    canAskProvider: mine && providerAnswersBalance(provider),
    lastAt: mine ? entry?.lastAt || null : lastSeen || null,
    users: rows.map((r) => consumerRow(r, names, agentNames)).sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt))),
  };
}

async function userNames(db) {
  const { rows } = await db.query('SELECT id, name, email FROM users ORDER BY created_at ASC LIMIT 500');
  return new Map(rows.map((r) => [String(r.id), r.name || r.email || 'Someone']));
}

// The same owner check as every other owner-only screen: the role saved in
// the database, never the session's copy of it. A refusal (or a database
// hiccup) shows the not-owner view; the window itself still opens.
async function isOwner(userId, db) {
  try {
    await assertSystemAdmin({ session: { userId } }, { db });
    return true;
  } catch (err) {
    if (err.statusCode === 403 || err.statusCode === 401) log.info('owner view refused', { account: Number(userId) || null });
    else log.warn('owner check failed, showing the not-owner view', { error: err.message });
    return false;
  }
}

// Only the owner sees who their keys are shared with.
async function sharingView(userId, owner, names) {
  if (getRuntimeMode() !== RUNTIME_MODES.LOCAL_DESKTOP) return { available: false };
  if (!owner) return { available: true, canManage: false, sharedWithMe: isKeySharedWith(userId) };
  const shared = readKeySharing().userIds;
  return { available: true, canManage: true, sharedWith: shared.map((id) => names.get(String(id)) || 'An account').sort() };
}

export async function buildAiResources({ userId, userRole, db = pool, deps = {} }) {
  const owner = await (deps.isOwner || isOwner)(userId, db);
  const held = await (deps.heldKeys || heldKeys)(userId, { db });
  const names = await userNames(db).catch(() => new Map());
  const agents = await (deps.agentRoutes || agentRoutes)({ userId, userRole, held, ...(deps.agentDefaults ? { defaults: deps.agentDefaults } : {}) });
  const agentNames = new Map(agents.map((a) => [String(a.id), a.name]));
  const ledger = (deps.ledgerKeys || ledgerKeys)();
  const me = String(userId);
  const visible = (entry, all) => Object.values(entry?.consumers || {}).filter((r) => all || String(r.userId) === me);

  const keys = held.map((k) => keyCard({
    keyId: k.keyId, provider: k.provider, last4: k.last4, source: k.source, mine: true,
    entry: k.keyId ? ledger[k.keyId] : null, rows: visible(k.keyId ? ledger[k.keyId] : null, true), names, agentNames,
  }));
  // Keys this person spent on but does not hold: the owner's shared key, the free allowance.
  const heldIds = new Set(held.map((k) => k.keyId));
  for (const [keyId, entry] of Object.entries(ledger)) {
    if (heldIds.has(keyId)) continue;
    const rows = visible(entry, false);
    if (!rows.length) continue;
    const source = rows.some((r) => r.allowance) ? 'allowance' : entry.provider === 'ollama' ? 'local' : 'shared';
    keys.push(keyCard({ keyId, provider: entry.provider, last4: owner ? entry.last4 : '', source, mine: false, entry, rows, names, agentNames }));
  }

  return {
    since: (deps.ledgerSince || ledgerSince)(),
    owner,
    keys,
    agents,
    clis: await (deps.cliResources || cliResources)({ userId, owner }).catch(() => []),
    sharing: await sharingView(userId, owner, names),
  };
}
