// Auction Watcher rows (docker/072-auction-watcher.sql). Every read and write
// is scoped to one person's user id.

import { wordList } from './match.js';

export const MAX_WATCHES = 25;
export const MIN_INTERVAL = 15;
const MAX_INTERVAL = 1440;

export function watchView(row) {
  return {
    id: row.id,
    site: row.site,
    query: row.query,
    maxPrice: row.max_price === null || row.max_price === undefined ? null : Number(row.max_price),
    mustWords: row.must_words || [],
    notWords: row.not_words || [],
    intervalMinutes: row.interval_minutes,
    status: row.status,
    statusNote: row.status_note || null,
    lastCheckedAt: row.last_checked_at ? new Date(row.last_checked_at).toISOString() : null,
    nextCheckAt: row.next_check_at ? new Date(row.next_check_at).toISOString() : null,
    matchCount: Number(row.match_count || 0),
    unseenCount: Number(row.unseen_count || 0),
  };
}

export function matchView(row) {
  const iso = (v) => (v ? new Date(v).toISOString() : null);
  return {
    id: row.id,
    watchId: row.watch_id,
    listingId: row.listing_id,
    title: row.title,
    price: row.price === null ? null : Number(row.price),
    currency: row.currency,
    endsAt: iso(row.ends_at),
    imageUrl: row.image_url,
    url: row.url,
    bids: row.bids,
    buyNow: row.buy_now === null ? null : Number(row.buy_now),
    redFlags: row.red_flags || [],
    insights: row.insights || null,
    lastSold: row.last_sold || null,
    foundAt: iso(row.found_at),
    seen: Boolean(row.seen_at),
    isNew: Boolean(row.notify) && !row.seen_at,
    ...(row.query ? { query: row.query, site: row.site } : {}),
  };
}

/** Clean what the window sent; throws a plain-words error on bad input. */
export function normalizeWatchInput(body = {}) {
  const site = body.site === 'ebay' ? 'ebay' : body.site === 'shopgoodwill' || !body.site ? 'shopgoodwill' : null;
  if (!site) throw Object.assign(new Error('Pick Goodwill or eBay.'), { statusCode: 400 });
  const query = String(body.query || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!query) throw Object.assign(new Error('Type what to search for, like "lenovo thinkpad".'), { statusCode: 400 });
  const max = Number(body.maxPrice);
  const interval = Math.round(Number(body.intervalMinutes) || 30);
  return {
    site,
    query,
    maxPrice: Number.isFinite(max) && max > 0 ? Math.min(max, 99999999) : null,
    mustWords: wordList(body.mustWords),
    notWords: wordList(body.notWords),
    intervalMinutes: Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, interval)),
  };
}

const WATCH_COLUMNS = `w.*,
  (SELECT COUNT(*) FROM auction_matches m WHERE m.watch_id = w.id AND NOT m.skipped) AS match_count,
  (SELECT COUNT(*) FROM auction_matches m WHERE m.watch_id = w.id AND m.seen_at IS NULL AND m.notify AND NOT m.skipped) AS unseen_count`;

export async function listWatches(db, userId) {
  const { rows } = await db.query(`SELECT ${WATCH_COLUMNS} FROM auction_watches w WHERE w.user_id = $1 ORDER BY w.created_at`, [userId]);
  return rows.map(watchView);
}

export async function getWatch(db, userId, id) {
  const { rows } = await db.query(`SELECT ${WATCH_COLUMNS} FROM auction_watches w WHERE w.user_id = $1 AND w.id = $2`, [userId, id]);
  return rows[0] ? watchView(rows[0]) : null;
}

export async function createWatch(db, userId, input) {
  const { rows: [{ count }] } = await db.query('SELECT COUNT(*)::int AS count FROM auction_watches WHERE user_id = $1', [userId]);
  if (count >= MAX_WATCHES) throw Object.assign(new Error(`You already have ${MAX_WATCHES} watches. Delete one first.`), { statusCode: 400 });
  const { rows } = await db.query(
    `INSERT INTO auction_watches (user_id, site, query, max_price, must_words, not_words, interval_minutes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [userId, input.site, input.query, input.maxPrice, input.mustWords, input.notWords, input.intervalMinutes],
  );
  return watchView(rows[0]);
}

/**
 * Pause, resume, or change how often. Resuming checks again as soon as the
 * 15-minute floor since the last check allows; a new interval counts from
 * the last check.
 */
export async function updateWatch(db, userId, id, { status, intervalMinutes } = {}) {
  const sets = [];
  const args = [userId, id];
  if (status === 'paused' || status === 'active') {
    args.push(status);
    sets.push(`status = $${args.length}`, 'status_note = NULL');
  }
  if (intervalMinutes !== undefined) {
    args.push(Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.round(Number(intervalMinutes) || 30))));
    sets.push(`interval_minutes = $${args.length}`);
  }
  if (!sets.length) return getWatch(db, userId, id);
  if (status === 'active' || intervalMinutes !== undefined) {
    const interval = intervalMinutes !== undefined ? `$${args.length}` : 'interval_minutes';
    sets.push(`next_check_at = GREATEST(NOW() + INTERVAL '30 seconds', COALESCE(last_checked_at + make_interval(mins => ${status === 'active' ? MIN_INTERVAL : `${interval}::int`}), NOW()))`);
  }
  await db.query(`UPDATE auction_watches SET ${sets.join(', ')} WHERE user_id = $1 AND id = $2`, args);
  return getWatch(db, userId, id);
}

export async function deleteWatch(db, userId, id) {
  const { rowCount } = await db.query('DELETE FROM auction_watches WHERE user_id = $1 AND id = $2', [userId, id]);
  return rowCount > 0;
}

/** Up to `limit` active watches whose time has come, pushed forward so no one else takes them. */
export async function claimDueWatches(db, limit = 3) {
  const { rows } = await db.query(
    `UPDATE auction_watches SET next_check_at = NOW() + make_interval(mins => interval_minutes)
     WHERE id IN (SELECT id FROM auction_watches WHERE status = 'active' AND next_check_at <= NOW()
                  ORDER BY next_check_at LIMIT $1 FOR UPDATE SKIP LOCKED)
     RETURNING *`,
    [limit],
  );
  return rows;
}

export async function recordCheck(db, watchId, { note = null, pause = false, worked = false } = {}) {
  await db.query(
    `UPDATE auction_watches SET last_checked_at = NOW(), status_note = $2, baseline_done = baseline_done OR $4,
       status = CASE WHEN $3 THEN 'paused' ELSE status END,
       next_check_at = GREATEST(next_check_at, NOW() + make_interval(mins => interval_minutes))
     WHERE id = $1`,
    [watchId, note, pause, worked],
  );
}

/** Listings this watch already has: listing id -> { read (its description), skipped }. */
export async function knownListings(db, watchId) {
  const { rows } = await db.query(
    'SELECT listing_id, details_read_at IS NOT NULL AS read, skipped FROM auction_matches WHERE watch_id = $1',
    [watchId],
  );
  return new Map(rows.map((r) => [r.listing_id, { read: Boolean(r.read), skipped: Boolean(r.skipped) }]));
}

/**
 * Save what a check found; returns the new rows worth showing. A listing
 * whose description was just read gets its red flags and skip from it.
 */
export async function saveMatches(db, watch, listings, { notify }) {
  const fresh = [];
  for (const l of listings) {
    const { rows } = await db.query(
      `INSERT INTO auction_matches (watch_id, user_id, listing_id, title, price, currency, ends_at, image_url, url, bids, buy_now, red_flags, notify, skipped, details_read_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13 AND NOT $14, $14, CASE WHEN $15 THEN NOW() END)
       ON CONFLICT (watch_id, listing_id) DO UPDATE SET price = EXCLUDED.price, bids = EXCLUDED.bids, ends_at = EXCLUDED.ends_at,
         red_flags = CASE WHEN $15 THEN EXCLUDED.red_flags ELSE auction_matches.red_flags END,
         skipped = auction_matches.skipped OR EXCLUDED.skipped,
         details_read_at = COALESCE(auction_matches.details_read_at, EXCLUDED.details_read_at)
       RETURNING *, (xmax = 0) AS inserted`,
      [watch.id, watch.user_id, l.id, l.title, l.price, l.currency || 'USD', l.endsAt, l.imageUrl, l.url, l.bids, l.buyNow, l.redFlags || [], notify, Boolean(l.skipped), Boolean(l.detailsRead)],
    );
    if (rows[0]?.inserted && !rows[0].skipped) fresh.push(matchView(rows[0]));
  }
  await db.query(`DELETE FROM auction_matches WHERE watch_id = $1 AND ends_at < NOW() - INTERVAL '7 days'`, [watch.id]);
  return fresh;
}

export async function listMatches(db, userId, watchId) {
  const { rows } = await db.query(
    `SELECT * FROM auction_matches WHERE user_id = $1 AND watch_id = $2 AND NOT skipped
       AND (ends_at IS NULL OR ends_at > NOW() - INTERVAL '1 day')
     ORDER BY (ends_at IS NULL), ends_at, id LIMIT 80`,
    [userId, watchId],
  );
  return rows.map(matchView);
}

export async function getMatch(db, userId, id) {
  const { rows } = await db.query(
    `SELECT m.*, w.query, w.site FROM auction_matches m JOIN auction_watches w ON w.id = m.watch_id
     WHERE m.user_id = $1 AND m.id = $2`,
    [userId, id],
  );
  return rows[0] || null;
}

export async function saveMatchExtra(db, userId, id, field, value) {
  if (!['insights', 'last_sold'].includes(field)) throw new Error('unknown field');
  await db.query(`UPDATE auction_matches SET ${field} = $3 WHERE user_id = $1 AND id = $2`, [userId, id, JSON.stringify(value)]);
}

export async function markSeen(db, userId, watchId) {
  const { rowCount } = await db.query(
    'UPDATE auction_matches SET seen_at = NOW() WHERE user_id = $1 AND watch_id = $2 AND seen_at IS NULL',
    [userId, watchId],
  );
  return rowCount;
}

/** New matches worth a notice: found since `since` (or the last 3 days), not seen yet. */
export async function freshMatches(db, userId, { since = null, limit = 20 } = {}) {
  const { rows } = await db.query(
    `SELECT m.*, w.query, w.site FROM auction_matches m JOIN auction_watches w ON w.id = m.watch_id
     WHERE m.user_id = $1 AND m.notify AND NOT m.skipped AND m.seen_at IS NULL
       AND m.found_at > COALESCE($2::timestamptz, NOW() - INTERVAL '3 days')
     ORDER BY m.found_at DESC LIMIT $3`,
    [userId, since, limit],
  );
  return rows.map(matchView);
}
