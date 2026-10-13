// server/routes/lessons.js
//
// Live lessons (spec 12), instructor side, behind the sign-in guard:
// create a class from the current board, read the classroom grid, stamp
// checkpoints "looks good", leave a note on a student's board, lower hands,
// hand out invite codes, remove a student, end the class. The student side
// is lessonsGuest.js, mounted with the guest routes before the guard.

import express from 'express';
import pool from '../db.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { publishWorkspaceEvent } from '../collaboration/workspaceHub.js';
import { createComment } from '../shareLinks/comments.js';
import { disconnectShareLink } from '../shareLinks/liveGuests.js';
import { readProjectedBoard } from '../shareLinks/projector.js';
import { revokeShareLink } from '../shareLinks/store.js';
import { cursorsFor } from '../lessons/cursorTap.js';
import { closeSeat, createClassFromBoard } from '../lessons/enroll.js';
import { helpQueue, progressFor, thumbnailOf } from '../lessons/model.js';
import { stripeConfig } from '../lessons/stripe.js';
import {
  endClass, getClass, getEnrollment, insertInviteCodes, listClasses, listEnrollments, listMarks, markApproved, setHand,
} from '../lessons/store.js';
import { MANAGE_ROLES, memberActor, requireUser, sendError } from './shareLinkHttp.js';

export const lessonsRouter = express.Router();
// The grid reads every student board; this link shape sees what a member
// sees minus private window kinds, which is all a thumbnail needs.
const THUMBNAIL_LINK = Object.freeze({ id: 'class-grid', role: 'view', scope_kind: 'board', stage: false });

export function publicClass(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    checkpoints: row.checkpoints || [],
    seatLimit: row.seat_limit,
    seatsTaken: row.seats_taken ?? undefined,
    gate: row.gate,
    agentMode: row.agent_mode,
    agentBudgetTokens: row.agent_budget_tokens,
    streamUrl: row.stream_url,
    createdAt: row.created_at,
    endedAt: row.ended_at,
  };
}

async function ownedClass(req, res) {
  if (!requireUser(req, res)) return null;
  try {
    const klass = await getClass(pool, req.params.classId);
    if (!klass) {
      res.status(404).json({ error: 'That class no longer exists.' });
      return null;
    }
    await requireWorkspaceMember(pool, { workspaceId: klass.workspace_id, userId: req.session.userId, roles: MANAGE_ROLES });
    return klass;
  } catch (error) {
    sendError(res, error);
    return null;
  }
}

async function seatOf(klass, req, res) {
  const seat = await getEnrollment(pool, req.params.enrollmentId);
  if (!seat || String(seat.class_id) !== String(klass.id)) {
    res.status(404).json({ error: 'That student is not in this class.' });
    return null;
  }
  return seat;
}

function nudgeStudent(seat) {
  if (seat.board_workspace_id) publishWorkspaceEvent(seat.board_workspace_id, { type: 'class.changed' }, { guests: true });
}

lessonsRouter.get('/workspaces/:workspaceId/classes', async (req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const workspace = await requireWorkspaceMember(pool, {
      workspaceId: req.params.workspaceId, userId: req.session.userId, roles: MANAGE_ROLES,
    });
    const rows = await listClasses(pool, { workspaceId: workspace.id });
    res.json({ classes: rows.map(publicClass), stripe: stripeConfig().enabled });
  } catch (error) {
    sendError(res, error);
  }
});

lessonsRouter.post('/workspaces/:workspaceId/classes', async (req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const workspace = await requireWorkspaceMember(pool, {
      workspaceId: req.params.workspaceId, userId: req.session.userId, roles: MANAGE_ROLES,
    });
    if (req.body?.gate === 'stripe' && !stripeConfig().enabled) {
      return res.status(503).json({ error: 'Stripe is not connected on this server yet. Use invite codes for now.', code: 'LESSON_STRIPE_OFF' });
    }
    const { klass, token, codes } = await createClassFromBoard(pool, {
      workspaceId: workspace.id, userId: req.session.userId, input: req.body || {}, parentHost: req.hostname,
    });
    // The join token and codes exist only in this response; the server keeps hashes.
    return res.status(201).json({ class: publicClass(klass), token, codes });
  } catch (error) {
    return sendError(res, error);
  }
});

lessonsRouter.get('/classes/:classId/roster', async (req, res) => {
  const klass = await ownedClass(req, res);
  if (!klass) return;
  try {
    const seats = await listEnrollments(pool, { classId: klass.id });
    const marks = await listMarks(pool, seats.map((seat) => seat.id));
    const students = await Promise.all(seats.map(async (seat) => {
      const board = seat.status === 'active' && seat.board_workspace_id
        ? await readProjectedBoard(seat.board_workspace_id, THUMBNAIL_LINK).catch(() => ({ wins: [] }))
        : { wins: [] };
      return {
        id: seat.id,
        name: seat.display_name,
        color: seat.color,
        status: seat.status,
        access: seat.access_source,
        boardWorkspaceId: seat.board_workspace_id,
        guestId: seat.guest_id,
        handRaisedAt: seat.hand_raised_at,
        progress: progressFor(klass.checkpoints, marks.filter((mark) => mark.enrollment_id === seat.id)),
        thumbnail: thumbnailOf(board),
        cursors: seat.board_workspace_id ? cursorsFor(seat.board_workspace_id) : [],
      };
    }));
    res.json({ class: publicClass(klass), students, helpQueue: helpQueue(seats) });
  } catch (error) {
    sendError(res, error);
  }
});

lessonsRouter.post('/classes/:classId/invite-codes', async (req, res) => {
  const klass = await ownedClass(req, res);
  if (!klass) return;
  try {
    const codes = await insertInviteCodes(pool, { classId: klass.id, count: Number(req.body?.count) || 1 });
    res.status(201).json({ codes });
  } catch (error) {
    sendError(res, error);
  }
});

lessonsRouter.post('/classes/:classId/students/:enrollmentId/checkpoints/:checkpointId', async (req, res) => {
  const klass = await ownedClass(req, res);
  if (!klass) return undefined;
  try {
    const seat = await seatOf(klass, req, res);
    if (!seat) return undefined;
    const step = (klass.checkpoints || []).find((item) => item.id === req.params.checkpointId);
    if (!step) return res.status(404).json({ error: 'That step is not in this lesson.' });
    const author = await memberActor(pool, req.session.userId);
    const note = String(req.body?.note || '').trim().slice(0, 500) || null;
    if (req.body?.approved !== undefined) {
      await markApproved(pool, { enrollmentId: seat.id, checkpointId: step.id, approved: Boolean(req.body.approved), by: author.name, note });
    }
    if (note && seat.board_workspace_id) {
      // A note is also pinned on the student's board, next to their work.
      const board = await readProjectedBoard(seat.board_workspace_id, THUMBNAIL_LINK).catch(() => ({ wins: [] }));
      const anchor = board.wins?.[0];
      await createComment(pool, {
        workspaceId: seat.board_workspace_id, author,
        input: { body: `${step.title}: ${note}`, x: (Number(anchor?.x) || 0) + 24, y: (Number(anchor?.y) || 0) - 28, windowId: anchor?.id || null },
      });
    }
    nudgeStudent(seat);
    return res.json({ ok: true });
  } catch (error) {
    return sendError(res, error);
  }
});

lessonsRouter.post('/classes/:classId/students/:enrollmentId/hand', async (req, res) => {
  const klass = await ownedClass(req, res);
  if (!klass) return undefined;
  try {
    const seat = await seatOf(klass, req, res);
    if (!seat) return undefined;
    await setHand(pool, { enrollmentId: seat.id, raised: Boolean(req.body?.raised) });
    nudgeStudent(seat);
    return res.json({ ok: true });
  } catch (error) {
    return sendError(res, error);
  }
});

lessonsRouter.post('/classes/:classId/students/:enrollmentId/remove', async (req, res) => {
  const klass = await ownedClass(req, res);
  if (!klass) return undefined;
  try {
    const seat = await seatOf(klass, req, res);
    if (!seat) return undefined;
    await closeSeat(pool, seat, { status: 'removed', reason: 'The instructor removed you from this class' });
    return res.json({ ok: true });
  } catch (error) {
    return sendError(res, error);
  }
});

lessonsRouter.post('/classes/:classId/end', async (req, res) => {
  const klass = await ownedClass(req, res);
  if (!klass) return;
  try {
    const ended = await endClass(pool, klass.id);
    if (klass.teacher_link_id) {
      await revokeShareLink(pool, { workspaceId: klass.workspace_id, linkId: klass.teacher_link_id });
      disconnectShareLink(klass.teacher_link_id, { reason: 'The class has ended' });
    }
    for (const seat of await listEnrollments(pool, { classId: klass.id })) {
      if (seat.status === 'active') await closeSeat(pool, seat, { status: 'lapsed', reason: 'The class has ended' });
    }
    res.json({ class: publicClass(ended) });
  } catch (error) {
    sendError(res, error);
  }
});
