import pool from '../db.js';
import { requireAutonomyOwnership } from '../autonomy/ownership.js';

const CONTACT_FIELDS = ['name', 'team', 'brokerage', 'city', 'phone', 'email', 'website'];
const SOCIAL_FIELDS = ['facebook', 'instagram', 'linkedin'];

function cleanText(value, max = 500) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 500).slice(0, max);
}

function cleanSignals(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((s) => typeof s === 'string').map((s) => s.trim()).filter(Boolean))].slice(0, 20);
}

function clampScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0.5;
  return Math.min(1, Math.max(0, num));
}

export function normalizeLeadInput(input = {}) {
  const lead = {};
  for (const field of [...CONTACT_FIELDS, ...SOCIAL_FIELDS]) {
    lead[field] = cleanText(input[field]);
  }
  if (!lead.name) throw Object.assign(new Error('Lead name is required.'), { statusCode: 400, code: 'LEAD_NAME_REQUIRED' });
  lead.buying_signals = cleanSignals(input.buying_signals);
  lead.icp_score = clampScore(input.icp_score);
  lead.status = cleanText(input.status, 32) || 'new';
  lead.source_url = cleanText(input.source_url, 2048);
  lead.notes = cleanText(input.notes, 4000);
  return lead;
}

/**
 * Save a scouted lead. Dedupes on exact email or phone match inside the
 * workspace (updates signals/score), otherwise inserts.
 */
export async function saveLead(input = {}, opts = {}) {
  const ownership = requireAutonomyOwnership(opts);
  const lead = normalizeLeadInput(input);

  const existing = await pool.query(
    `SELECT id FROM sales_leads WHERE workspace_id = $1
       AND ((email IS NOT DISTINCT FROM $2 AND $2 IS NOT NULL)
         OR (phone IS NOT DISTINCT FROM $3 AND $3 IS NOT NULL))
     LIMIT 1`,
    [ownership.workspaceId, lead.email, lead.phone]
  );

  if (existing.rows[0]) {
    const { rows } = await pool.query(
      `UPDATE sales_leads
         SET buying_signals = (SELECT ARRAY(SELECT DISTINCT UNNEST(buying_signals || $2::text[]))),
             icp_score = GREATEST(icp_score, $3),
             notes = COALESCE($4, notes),
             updated_at = NOW()
         WHERE id = $1 RETURNING id`,
      [existing.rows[0].id, lead.buying_signals, lead.icp_score, lead.notes]
    );
    return { id: rows[0].id, deduped: true };
  }

  const { rows } = await pool.query(
    `INSERT INTO sales_leads (workspace_id, created_by_user_id, name, team, brokerage, city,
        phone, email, website, facebook, instagram, linkedin,
        buying_signals, icp_score, status, source_url, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING id`,
    [ownership.workspaceId, ownership.userId, lead.name, lead.team, lead.brokerage, lead.city,
     lead.phone, lead.email, lead.website, lead.facebook, lead.instagram, lead.linkedin,
     lead.buying_signals, lead.icp_score, lead.status, lead.source_url, lead.notes]
  );
  return { id: rows[0].id, deduped: false };
}

export async function listLeads(opts = {}) {
  const ownership = requireAutonomyOwnership(opts);
  const params = [ownership.workspaceId];
  let sql = `SELECT id, name, team, brokerage, city, phone, email, website,
               facebook, instagram, linkedin, buying_signals, icp_score,
               status, source_url, notes, created_at, updated_at
             FROM sales_leads WHERE workspace_id = $1`;
  if (opts.status) {
    params.push(opts.status);
    sql += ` AND status = $${params.length}`;
  }
  if (Number.isFinite(Number(opts.minScore))) {
    params.push(Number(opts.minScore));
    sql += ` AND icp_score >= $${params.length}`;
  }
  sql += ` ORDER BY icp_score DESC, created_at DESC LIMIT ${Math.min(Number(opts.limit) || 50, 200)}`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function setLeadStatus(leadId, status, opts = {}) {
  const ownership = requireAutonomyOwnership(opts);
  const { rows } = await pool.query(
    `UPDATE sales_leads SET status = $3, updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2 RETURNING id`,
    [leadId, ownership.workspaceId, String(status || 'new').slice(0, 32)]
  );
  return Boolean(rows[0]);
}
