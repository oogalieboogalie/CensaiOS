// Spec 5b listings of kind "Copy to your board", for spec 6 modules. A
// seller publishes a module they built; it is checked, fingerprinted and
// signed before it is listed, and buyers copy it onto their own board.
// Phase 0: only the platform owner (an admin of this censaiOS install, which
// is Alex) may sell. Paid listings wait for Stripe, so every listing is free.
// Tables are created on first use, like My modules.

import { MAX_MODULE_SOURCE_BYTES, normalizeManifest, sourceBytes } from '../../src/lib/modules/moduleFormat.js';
import { runModuleChecks, prohibitedUse } from './moduleChecks.js';
import { namesTooClose } from './listingNames.js';
import { moduleCard } from '../../src/lib/marketplace/moduleCard.js';
import { certificateBody, fingerprint, signCertificate, signingKeys, verifyCertificate } from './signing.js';

export const SELLER_TIERS = Object.freeze({
  probation: { label: 'Probation', maxListings: 3 },
  verified: { label: 'Verified', maxListings: 20 },
  trusted: { label: 'Trusted', maxListings: 200 },
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS seller_accounts (
  user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tier               TEXT NOT NULL DEFAULT 'probation',
  status             TEXT NOT NULL DEFAULT 'active',
  note               TEXT NOT NULL DEFAULT '',
  stripe_account_id  TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            TEXT NOT NULL DEFAULT 'module',
  seller_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  summary         TEXT NOT NULL DEFAULT '',
  request         TEXT NOT NULL DEFAULT '',
  manifest        JSONB NOT NULL,
  source          TEXT NOT NULL,
  price_model     TEXT NOT NULL DEFAULT 'free',
  price_cents     INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'listed',
  fingerprint     TEXT NOT NULL,
  checks          JSONB NOT NULL,
  certificate     JSONB,
  installs        INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS marketplace_listings_status_idx ON marketplace_listings (kind, status, updated_at DESC);`;

const ready = new WeakMap();

function ensureSchema(db) {
  if (!ready.has(db)) ready.set(db, db.query(SCHEMA).catch((err) => { ready.delete(db); throw err; }));
  return ready.get(db);
}

function marketError(message, code, statusCode = 400, extra = {}) {
  return Object.assign(new Error(message), { code, statusCode, ...extra });
}

function requireUser(userId) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id <= 0) throw marketError('Sign in to use the marketplace.', 'AUTHENTICATION_REQUIRED', 401);
  return id;
}

async function sellerFor(db, userId) {
  const { rows } = await db.query('SELECT role FROM users WHERE id=$1', [userId]);
  const owner = rows[0]?.role === 'admin';
  const { rows: acct } = await db.query('SELECT tier, status, note FROM seller_accounts WHERE user_id=$1', [userId]);
  if (acct[0]) return { ...acct[0], canSell: acct[0].status === 'active' };
  if (!owner) return null;
  // Phase 0: the owner of this install is the one seller, picked by Alex.
  const { rows: created } = await db.query(
    `INSERT INTO seller_accounts (user_id, tier, status, note) VALUES ($1, 'trusted', 'active', 'Platform owner (phase 0)')
     ON CONFLICT (user_id) DO UPDATE SET user_id=EXCLUDED.user_id RETURNING tier, status, note`,
    [userId],
  );
  return { ...created[0], canSell: created[0].status === 'active' };
}

export async function sellerStatus(db, userId) {
  const uid = requireUser(userId);
  await ensureSchema(db);
  const seller = await sellerFor(db, uid);
  const { rows } = await db.query('SELECT role FROM users WHERE id=$1', [uid]);
  const owner = rows[0]?.role === 'admin';
  if (!seller?.canSell) {
    return { canSell: false, owner, reason: 'Selling opens to vetted sellers later. For now only the owner of this censaiOS can publish.' };
  }
  return { canSell: true, owner, tier: seller.tier, tierLabel: SELLER_TIERS[seller.tier]?.label || seller.tier, note: seller.note };
}

/** Dry run: what the checks say, and whether the words are allowed at all. */
export function previewModuleListing({ manifest, source, request = '', summary = '' }) {
  const clean = normalizeManifest(manifest, { request });
  const refused = prohibitedUse(clean.name, clean.description, summary, request);
  const checks = runModuleChecks({ manifest: clean, source, request });
  return { checks, refused, fingerprint: fingerprint(moduleCard({ manifest: clean, source })) };
}

async function verifiedFlag(db, r) {
  const keys = await signingKeys(db);
  const current = fingerprint(moduleCard({ manifest: r.manifest, source: r.source }));
  const signed = verifyCertificate(keys.publicKey, r.certificate) && r.certificate.fingerprint === r.fingerprint;
  return { verified: signed && current === r.fingerprint, changed: signed && current !== r.fingerprint };
}

async function present(db, r, { withSource = false } = {}) {
  const flag = await verifiedFlag(db, r);
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    summary: r.summary,
    request: r.request,
    manifest: r.manifest,
    priceModel: r.price_model,
    priceCents: r.price_cents,
    status: r.status,
    fingerprint: r.fingerprint,
    checks: { score: r.checks.score, total: r.checks.total, ranAt: r.checks.ranAt, suite: r.checks.suite, passed: r.checks.passed },
    seller: { id: r.seller_user_id, name: r.seller_name || 'Censai', tier: r.seller_tier || null },
    installs: r.installs,
    updatedAt: r.updated_at,
    ...flag,
    ...(withSource ? { source: r.source, certificate: r.certificate, checkResults: r.checks.results } : {}),
  };
}

export { nameKey, namesTooClose } from './listingNames.js';

const SELECT = `SELECT l.*, u.name AS seller_name, s.tier AS seller_tier
  FROM marketplace_listings l
  LEFT JOIN users u ON u.id = l.seller_user_id
  LEFT JOIN seller_accounts s ON s.user_id = l.seller_user_id`;

/**
 * Publish a new listing or update one the seller owns (listingId). Every
 * publish reruns the checks and signs a fresh certificate, so a changed
 * module is never shown with an old badge.
 */
export async function publishModuleListing(db, userId, { listingId = null, request = '', manifest, source, summary = '' }, { now = new Date() } = {}) {
  const uid = requireUser(userId);
  await ensureSchema(db);
  const seller = await sellerFor(db, uid);
  if (!seller?.canSell) throw marketError('Selling opens to vetted sellers later. For now only the owner of this censaiOS can publish.', 'MARKETPLACE_SELLER_NOT_VETTED', 403);

  const body = String(source || '');
  if (!body.trim()) throw marketError('There is no module to publish yet.', 'MODULE_SOURCE_REQUIRED');
  if (sourceBytes(body) > MAX_MODULE_SOURCE_BYTES) throw marketError('This module is too large to publish.', 'MODULE_TOO_LARGE', 413);
  const clean = normalizeManifest(manifest, { request });
  const oneLine = String(summary || clean.description || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const preview = previewModuleListing({ manifest: clean, source: body, request, summary: oneLine });
  if (preview.refused) throw marketError(`Listings for ${preview.refused} are not allowed on Censai.`, 'MARKETPLACE_PROHIBITED_USE', 422);
  if (!preview.checks.passed) {
    throw marketError(`It passed ${preview.checks.score} of ${preview.checks.total} checks. Fix the ones marked below, then publish.`, 'MARKETPLACE_CHECKS_FAILED', 422, { checks: preview.checks });
  }

  const { rows: others } = await db.query(
    "SELECT name FROM marketplace_listings WHERE status='listed' AND seller_user_id<>$1",
    [uid],
  );
  const clash = others.find(o => namesTooClose(o.name, clean.name));
  if (clash) throw marketError(`"${clean.name}" is too close to "${clash.name}", which another seller lists. Pick a different name.`, 'MARKETPLACE_NAME_TOO_CLOSE', 409);

  let existing = null;
  if (listingId) {
    const { rows } = await db.query('SELECT id FROM marketplace_listings WHERE id::text=$1 AND seller_user_id=$2', [String(listingId), uid]);
    existing = rows[0] || null;
  }
  if (!existing) {
    const { rows: count } = await db.query("SELECT COUNT(*)::int AS n FROM marketplace_listings WHERE seller_user_id=$1 AND status<>'removed'", [uid]);
    const cap = SELLER_TIERS[seller.tier]?.maxListings ?? SELLER_TIERS.probation.maxListings;
    if (count[0].n >= cap) throw marketError(`Your ${SELLER_TIERS[seller.tier]?.label || 'current'} tier allows ${cap} listings. Remove one first.`, 'MARKETPLACE_LISTING_LIMIT', 409);
  }

  const values = [clean.name, oneLine, String(request).slice(0, 2000), JSON.stringify(clean), body, preview.fingerprint, JSON.stringify(preview.checks)];
  let id;
  if (existing) {
    await db.query(
      `UPDATE marketplace_listings SET name=$2, summary=$3, request=$4, manifest=$5, source=$6, fingerprint=$7, checks=$8,
         status='listed', updated_at=NOW() WHERE id=$1`,
      [existing.id, ...values],
    );
    id = existing.id;
  } else {
    const { rows } = await db.query(
      `INSERT INTO marketplace_listings (seller_user_id, name, summary, request, manifest, source, fingerprint, checks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [uid, ...values],
    );
    id = rows[0].id;
  }
  const certificate = await signCertificate(db, certificateBody({
    listingId: id, fingerprint: preview.fingerprint, sellerId: uid, checks: preview.checks, issuedAt: now.toISOString(),
  }));
  await db.query('UPDATE marketplace_listings SET certificate=$2 WHERE id=$1', [id, JSON.stringify(certificate)]);
  return getModuleListing(db, uid, id, { withSource: true });
}

export async function listModuleListings(db, userId) {
  requireUser(userId);
  await ensureSchema(db);
  const { rows } = await db.query(`${SELECT} WHERE l.kind='module' AND l.status='listed' ORDER BY l.updated_at DESC LIMIT 200`);
  return Promise.all(rows.map(r => present(db, r)));
}

export async function getModuleListing(db, userId, id, { withSource = true } = {}) {
  const uid = requireUser(userId);
  await ensureSchema(db);
  const { rows } = await db.query(`${SELECT} WHERE l.id::text=$1 AND (l.status='listed' OR l.seller_user_id=$2)`, [String(id || ''), uid]);
  if (!rows[0]) throw marketError('That listing is not available.', 'MARKETPLACE_LISTING_NOT_FOUND', 404);
  return present(db, rows[0], { withSource });
}

/** A buyer copies a listed module onto their board. */
export async function installModuleListing(db, userId, id) {
  const uid = requireUser(userId);
  await ensureSchema(db);
  const { rows } = await db.query(
    "UPDATE marketplace_listings SET installs=installs+1 WHERE id::text=$1 AND status='listed' RETURNING id",
    [String(id || '')],
  );
  if (!rows[0]) throw marketError('That listing is not available.', 'MARKETPLACE_LISTING_NOT_FOUND', 404);
  return getModuleListing(db, uid, rows[0].id);
}

/** The seller takes a listing down; copies already on boards stay. */
export async function unlistModuleListing(db, userId, id) {
  const uid = requireUser(userId);
  await ensureSchema(db);
  const { rowCount } = await db.query(
    "UPDATE marketplace_listings SET status='removed', updated_at=NOW() WHERE id::text=$1 AND seller_user_id=$2",
    [String(id || ''), uid],
  );
  return rowCount > 0;
}

export async function marketplacePublicKey(db) {
  const keys = await signingKeys(db);
  return { keyId: keys.id, algorithm: 'Ed25519', publicKey: keys.publicKey };
}
