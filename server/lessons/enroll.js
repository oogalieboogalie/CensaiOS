// server/lessons/enroll.js
//
// The moving parts of a class: creating one from a lesson board, giving
// each student their own copy of the starter board, and ending a student's
// access when their membership lapses. Built on spec 5's share links: a
// student is a guest whose pass opens their own board for editing and the
// instructor's board through the class's watch link.

import { docToSnapshot } from '../collab/seedFromSnapshot.js';
import { openCanvasDocReader } from '../collab/liveDoc.js';
import { WORKSPACE_STATE_KEY, getWorkspaceState, setWorkspaceState } from '../state/clientStateStore.js';
import { disconnectShareLink } from '../shareLinks/liveGuests.js';
import { createShareLink, revokeShareLink } from '../shareLinks/store.js';
import { createGuestId } from '../shareLinks/tokens.js';
import { LessonError, lessonTemplate, normalizeClassInput } from './model.js';
import {
  attachBoard,
  insertClass,
  insertEnrollment,
  insertInviteCodes,
  setEnrollmentStatus,
} from './store.js';

/** The lesson board as it is right now: the live doc, else the last save. */
export async function readBoardSnapshot(db, workspaceId) {
  const reader = await openCanvasDocReader(workspaceId).catch(() => null);
  try {
    if (reader?.doc) return docToSnapshot(reader.doc);
  } finally {
    await Promise.resolve(reader?.close?.()).catch(() => undefined);
  }
  const state = await getWorkspaceState({ db, workspaceId, key: WORKSPACE_STATE_KEY });
  return state?.found && state.value ? state.value : {};
}

async function tagClassLink(db, linkId, classId) {
  await db.query('UPDATE share_links SET class_id = $2 WHERE id = $1', [linkId, classId]);
}

export async function createClassFromBoard(db, {
  workspaceId, userId, input, parentHost, readSnapshot = readBoardSnapshot,
}) {
  const fields = normalizeClassInput(input, { parentHost });
  const template = lessonTemplate(await readSnapshot(db, workspaceId));
  // Students follow the instructor through a watch link that is live (they
  // get the camera) but not staged (they see the whole lesson board).
  const { link } = await createShareLink(db, {
    workspaceId, userId,
    input: { role: 'view', mode: 'live', stage: false, label: `Class: ${fields.title}` },
  });
  const { klass, token } = await insertClass(db, { workspaceId, userId, fields, template, teacherLinkId: link.id });
  await tagClassLink(db, link.id, klass.id);
  const codes = fields.gate === 'invite' ? await insertInviteCodes(db, { classId: klass.id, count: fields.seatLimit }) : [];
  return { klass, token, codes };
}

export function studentBoardId(klass, enrollment) {
  return `class-${String(klass.id).slice(0, 8)}-${String(enrollment.id).replace(/-/g, '').slice(0, 12)}`;
}

/**
 * Copy the starter board into a workspace the instructor owns (so they can
 * open it, help and take over) and give the student an edit link to it.
 */
export async function provisionBoard(db, klass, enrollment) {
  const boardId = studentBoardId(klass, enrollment);
  await db.query(
    `INSERT INTO workspaces (id, name, created_by_user_id) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
    [boardId, `${klass.title} · ${enrollment.display_name}`.slice(0, 120), klass.owner_user_id],
  );
  await db.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')
     ON CONFLICT (workspace_id, user_id) DO NOTHING`,
    [boardId, klass.owner_user_id],
  );
  const existing = await getWorkspaceState({ db, workspaceId: boardId, key: WORKSPACE_STATE_KEY });
  if (!existing?.found) {
    const template = klass.template || {};
    await setWorkspaceState({
      db, workspaceId: boardId, key: WORKSPACE_STATE_KEY, expectedRevision: 0,
      value: { ...template, workspaceId: boardId },
    });
  }
  const { link } = await createShareLink(db, {
    workspaceId: boardId, userId: klass.owner_user_id,
    input: {
      role: 'edit', label: `Class seat: ${enrollment.display_name}`,
      agentBudgetTokens: klass.agent_mode === 'instructor' ? klass.agent_budget_tokens : 0,
    },
  });
  await tagClassLink(db, link.id, klass.id);
  return attachBoard(db, { enrollmentId: enrollment.id, workspaceId: boardId, linkId: link.id });
}

export async function enrollStudent(db, {
  klass, name, color, source, ref = null, checkoutId = null, status = 'active',
}) {
  if (klass.ended_at) throw new LessonError('This class has ended.', { code: 'LESSON_ENDED', statusCode: 410 });
  if (Number(klass.seats_taken || 0) >= Number(klass.seat_limit)) {
    throw new LessonError('This class is full.', { code: 'LESSON_FULL', statusCode: 409 });
  }
  const { enrollment, rejoinToken } = await insertEnrollment(db, {
    classId: klass.id, name, color, guestId: createGuestId(), source, ref, checkoutId, status,
  });
  const ready = status === 'active' ? await provisionBoard(db, klass, enrollment) : enrollment;
  return { enrollment: ready, rejoinToken };
}

/** What goes in the student's guest session: their seat and the class watch link. */
export function studentGuestPass(klass, enrollment) {
  return {
    linkId: enrollment.board_link_id,
    workspaceId: enrollment.board_workspace_id,
    guestId: enrollment.guest_id,
    name: enrollment.display_name,
    color: enrollment.color,
    joinedAt: new Date().toISOString(),
    classId: klass.id,
    enrollmentId: enrollment.id,
    classLinks: klass.teacher_link_id ? { [klass.workspace_id]: klass.teacher_link_id } : {},
  };
}

export function enrollmentSocketKey(enrollmentId) {
  return `enrollment:${enrollmentId}`;
}

/** End a seat: revoke its board link and close every socket the student holds. */
export async function closeSeat(db, enrollment, { status = 'lapsed', reason = 'Your class membership has ended' } = {}) {
  const row = await setEnrollmentStatus(db, { enrollmentId: enrollment.id, status });
  if (enrollment.board_link_id && enrollment.board_workspace_id) {
    await revokeShareLink(db, { workspaceId: enrollment.board_workspace_id, linkId: enrollment.board_link_id });
    disconnectShareLink(enrollment.board_link_id, { reason });
  }
  disconnectShareLink(enrollmentSocketKey(enrollment.id), { reason });
  return row;
}

/** A lapsed member paid again: same board, fresh link. */
export async function reopenSeat(db, klass, enrollment, { ref = null } = {}) {
  const active = await setEnrollmentStatus(db, { enrollmentId: enrollment.id, status: 'active', ref });
  return provisionBoard(db, klass, active);
}
