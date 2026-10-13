// server/lessons/store.js
//
// Postgres access for classes, invite codes, enrollments and checkpoint
// marks. Every function takes the db (pool or client) first so tests can
// pass a fake and routes can pass the shared pool.

import crypto from 'node:crypto';
import { createShareToken, hashShareToken } from '../shareLinks/tokens.js';

const CLASS_COLUMNS = `c.id, c.workspace_id, c.owner_user_id, c.title, c.checkpoints, c.seat_limit, c.gate,
  c.stripe_price_id, c.agent_mode, c.agent_budget_tokens, c.stream_url, c.teacher_link_id, c.created_at, c.ended_at`;
const ENROLLMENT_COLUMNS = `e.id, e.class_id, e.display_name, e.color, e.guest_id, e.board_workspace_id,
  e.board_link_id, e.access_source, e.access_ref, e.status, e.hand_raised_at, e.created_at`;

// Invite codes are typed by people: short, no look-alike characters.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function createInviteCode() {
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function normalizeInviteCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashInviteCode(value) {
  return crypto.createHash('sha256').update(`lesson-invite:${normalizeInviteCode(value)}`).digest('hex');
}

export async function insertClass(db, { workspaceId, userId, fields, template, teacherLinkId }) {
  const token = createShareToken();
  const { rows } = await db.query(
    `INSERT INTO lesson_classes AS c (workspace_id, owner_user_id, title, checkpoints, template, seat_limit, gate,
       stripe_price_id, agent_mode, agent_budget_tokens, stream_url, join_token_hash, teacher_link_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING ${CLASS_COLUMNS}`,
    [workspaceId, userId, fields.title, JSON.stringify(fields.checkpoints), JSON.stringify(template),
      fields.seatLimit, fields.gate, fields.stripePriceId, fields.agentMode, fields.agentBudgetTokens,
      fields.streamUrl, hashShareToken(token), teacherLinkId],
  );
  return { klass: rows[0], token };
}

export async function listClasses(db, { workspaceId }) {
  const { rows } = await db.query(
    `SELECT ${CLASS_COLUMNS},
            (SELECT COUNT(*)::int FROM lesson_enrollments e WHERE e.class_id = c.id AND e.status = 'active') AS seats_taken
       FROM lesson_classes c WHERE c.workspace_id = $1 ORDER BY c.created_at DESC LIMIT 20`,
    [workspaceId],
  );
  return rows;
}

export async function getClass(db, classId) {
  const { rows } = await db.query(`SELECT ${CLASS_COLUMNS}, c.template FROM lesson_classes c WHERE c.id::text = $1`, [String(classId)]);
  return rows[0] || null;
}

export async function findClassByToken(db, token) {
  const { rows } = await db.query(
    `SELECT ${CLASS_COLUMNS}, c.template, w.name AS workspace_name, u.name AS instructor_name,
            (SELECT COUNT(*)::int FROM lesson_enrollments e WHERE e.class_id = c.id AND e.status IN ('active', 'pending')) AS seats_taken
       FROM lesson_classes c
       JOIN workspaces w ON w.id = c.workspace_id
       LEFT JOIN users u ON u.id = c.owner_user_id
      WHERE c.join_token_hash = $1`,
    [hashShareToken(token)],
  );
  return rows[0] || null;
}

export async function endClass(db, classId) {
  const { rows } = await db.query(
    `UPDATE lesson_classes c SET ended_at = COALESCE(c.ended_at, NOW()) WHERE c.id::text = $1 RETURNING ${CLASS_COLUMNS}`,
    [String(classId)],
  );
  return rows[0] || null;
}

export async function insertInviteCodes(db, { classId, count = 1, maxUses = 1 }) {
  const codes = [];
  for (let i = 0; i < Math.min(Math.max(1, count), 50); i += 1) {
    const code = createInviteCode();
    await db.query(
      'INSERT INTO lesson_invite_codes (class_id, code_hash, max_uses) VALUES ($1,$2,$3)',
      [classId, hashInviteCode(code), Math.min(Math.max(1, maxUses), 500)],
    );
    codes.push(code);
  }
  return codes;
}

/** Spend one use of a code. Returns false for a wrong, used-up or revoked code. */
export async function consumeInviteCode(db, { classId, code }) {
  if (!normalizeInviteCode(code)) return false;
  const { rows } = await db.query(
    `UPDATE lesson_invite_codes SET uses = uses + 1
      WHERE class_id = $1 AND code_hash = $2 AND revoked_at IS NULL AND uses < max_uses
      RETURNING id`,
    [classId, hashInviteCode(code)],
  );
  return Boolean(rows[0]);
}

export async function insertEnrollment(db, {
  classId, name, color, guestId, source, ref = null, checkoutId = null, status = 'active',
}) {
  const rejoinToken = createShareToken();
  const { rows } = await db.query(
    `INSERT INTO lesson_enrollments AS e (class_id, display_name, color, guest_id, rejoin_token_hash,
       access_source, access_ref, checkout_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING ${ENROLLMENT_COLUMNS}`,
    [classId, name, color, guestId, hashShareToken(rejoinToken), source, ref, checkoutId, status],
  );
  return { enrollment: rows[0], rejoinToken };
}

export async function attachBoard(db, { enrollmentId, workspaceId, linkId }) {
  const { rows } = await db.query(
    `UPDATE lesson_enrollments e SET board_workspace_id = $2, board_link_id = $3
      WHERE e.id = $1 RETURNING ${ENROLLMENT_COLUMNS}`,
    [enrollmentId, workspaceId, linkId],
  );
  return rows[0] || null;
}

export async function listEnrollments(db, { classId }) {
  const { rows } = await db.query(
    `SELECT ${ENROLLMENT_COLUMNS} FROM lesson_enrollments e
      WHERE e.class_id = $1 AND e.status <> 'removed' ORDER BY e.created_at LIMIT 64`,
    [classId],
  );
  return rows;
}

export async function getEnrollment(db, enrollmentId) {
  const { rows } = await db.query(`SELECT ${ENROLLMENT_COLUMNS} FROM lesson_enrollments e WHERE e.id::text = $1`, [String(enrollmentId)]);
  return rows[0] || null;
}

export async function findEnrollmentByRejoin(db, { classId, token }) {
  const { rows } = await db.query(
    `SELECT ${ENROLLMENT_COLUMNS} FROM lesson_enrollments e WHERE e.class_id = $1 AND e.rejoin_token_hash = $2`,
    [classId, hashShareToken(token)],
  );
  return rows[0] || null;
}

export async function findEnrollmentByCheckout(db, checkoutId) {
  const { rows } = await db.query(`SELECT ${ENROLLMENT_COLUMNS} FROM lesson_enrollments e WHERE e.checkout_id = $1`, [String(checkoutId)]);
  return rows[0] || null;
}

export async function findEnrollmentsByAccessRef(db, { source, ref }) {
  const { rows } = await db.query(
    `SELECT ${ENROLLMENT_COLUMNS} FROM lesson_enrollments e WHERE e.access_source = $1 AND e.access_ref = $2`,
    [source, String(ref)],
  );
  return rows;
}

export async function setEnrollmentStatus(db, { enrollmentId, status, ref }) {
  const { rows } = await db.query(
    `UPDATE lesson_enrollments e SET status = $2, access_ref = COALESCE($3, e.access_ref)
      WHERE e.id = $1 RETURNING ${ENROLLMENT_COLUMNS}`,
    [enrollmentId, status, ref ?? null],
  );
  return rows[0] || null;
}

export async function setHand(db, { enrollmentId, raised }) {
  const { rows } = await db.query(
    `UPDATE lesson_enrollments e SET hand_raised_at = CASE WHEN $2 THEN COALESCE(e.hand_raised_at, NOW()) ELSE NULL END
      WHERE e.id = $1 RETURNING ${ENROLLMENT_COLUMNS}`,
    [enrollmentId, Boolean(raised)],
  );
  return rows[0] || null;
}

export async function listMarks(db, enrollmentIds) {
  if (!enrollmentIds.length) return [];
  const { rows } = await db.query(
    'SELECT * FROM lesson_checkpoint_marks WHERE enrollment_id = ANY($1::uuid[])',
    [enrollmentIds],
  );
  return rows;
}

/** A student ticks (or unticks) a step. Unticking also clears the stamp. */
export async function markDone(db, { enrollmentId, checkpointId, done }) {
  await db.query(
    `INSERT INTO lesson_checkpoint_marks (enrollment_id, checkpoint_id, done_at)
     VALUES ($1, $2, CASE WHEN $3 THEN NOW() ELSE NULL END)
     ON CONFLICT (enrollment_id, checkpoint_id) DO UPDATE
       SET done_at = CASE WHEN $3 THEN COALESCE(lesson_checkpoint_marks.done_at, NOW()) ELSE NULL END,
           approved_at = CASE WHEN $3 THEN lesson_checkpoint_marks.approved_at ELSE NULL END,
           approved_by = CASE WHEN $3 THEN lesson_checkpoint_marks.approved_by ELSE NULL END`,
    [enrollmentId, checkpointId, Boolean(done)],
  );
}

/** The instructor stamps a step "looks good", or takes the stamp back. */
export async function markApproved(db, { enrollmentId, checkpointId, approved, by, note = null }) {
  await db.query(
    `INSERT INTO lesson_checkpoint_marks (enrollment_id, checkpoint_id, approved_at, approved_by, note)
     VALUES ($1, $2, CASE WHEN $3 THEN NOW() ELSE NULL END, CASE WHEN $3 THEN $4 ELSE NULL END, $5)
     ON CONFLICT (enrollment_id, checkpoint_id) DO UPDATE
       SET approved_at = CASE WHEN $3 THEN NOW() ELSE NULL END,
           approved_by = CASE WHEN $3 THEN $4 ELSE NULL END,
           note = COALESCE($5, lesson_checkpoint_marks.note)`,
    [enrollmentId, checkpointId, Boolean(approved), by, note],
  );
}
