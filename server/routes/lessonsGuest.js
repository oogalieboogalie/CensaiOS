// server/routes/lessonsGuest.js
//
// Live lessons (spec 12), student side, mounted at /api/guest/classes
// before the sign-in guard. A student opens the class link, proves access
// (an invite code, or a paid Stripe subscription), and gets a guest pass
// for their own seat. A rejoin token kept in their browser brings them back
// to the same board later without spending another code.

import express from 'express';
import pool from '../db.js';
import { publishWorkspaceEvent } from '../collaboration/workspaceHub.js';
import { resolveGuestSession } from '../shareLinks/guestSession.js';
import { isShareTokenShape, normalizeGuestColor, normalizeGuestName } from '../shareLinks/tokens.js';
import { enrollStudent, studentGuestPass } from '../lessons/enroll.js';
import { progressFor } from '../lessons/model.js';
import { createCheckoutSession, stripeConfig } from '../lessons/stripe.js';
import {
  consumeInviteCode, findClassByToken, findEnrollmentByRejoin, getClass, getEnrollment, listMarks, markDone, setHand,
} from '../lessons/store.js';
import { joinBlocked, recordJoinFailure } from './guestLinks.js';
import { sendError } from './shareLinkHttp.js';

export const lessonGuestRouter = express.Router();

const GONE = { error: 'This class link was turned off, has ended, or never existed.', code: 'LESSON_LINK_INACTIVE' };

async function classForToken(req, res) {
  const attemptKey = `class:${req.ip || 'unknown'}`;
  if (joinBlocked(attemptKey)) {
    res.status(429).json({ error: 'Too many tries. Wait a minute and try again.', code: 'GUEST_JOIN_RATE_LIMITED' });
    return null;
  }
  const klass = isShareTokenShape(req.params.token) ? await findClassByToken(pool, req.params.token) : null;
  if (!klass || klass.ended_at) {
    recordJoinFailure(attemptKey);
    res.status(404).json(GONE);
    return null;
  }
  return klass;
}

function preview(klass) {
  return {
    classId: klass.id,
    title: klass.title,
    instructor: klass.instructor_name || null,
    workspaceName: klass.workspace_name,
    gate: klass.gate,
    steps: (klass.checkpoints || []).length,
    seatsLeft: Math.max(0, klass.seat_limit - (klass.seats_taken || 0)),
    stripeReady: klass.gate !== 'stripe' || stripeConfig().enabled,
  };
}

function admit(req, res, klass, seat, extra = {}) {
  req.session.guest = studentGuestPass(klass, seat);
  return req.session.save((error) => {
    if (error) return sendError(res, error);
    return res.status(201).json({ ...preview(klass), joined: true, boardWorkspaceId: seat.board_workspace_id, ...extra });
  });
}

lessonGuestRouter.get('/:token', async (req, res) => {
  try {
    const klass = await classForToken(req, res);
    if (klass) res.json(preview(klass));
  } catch (error) {
    sendError(res, error);
  }
});

lessonGuestRouter.post('/:token/join', async (req, res) => {
  try {
    const klass = await classForToken(req, res);
    if (!klass) return undefined;
    const name = normalizeGuestName(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Type the name your instructor will see.', code: 'GUEST_NAME_REQUIRED' });
    const color = normalizeGuestColor(req.body?.color);
    if ((klass.seats_taken || 0) >= klass.seat_limit) return res.status(409).json({ error: 'This class is full.', code: 'LESSON_FULL' });
    if (klass.gate === 'invite') {
      if (!(await consumeInviteCode(pool, { classId: klass.id, code: req.body?.code }))) {
        recordJoinFailure(`class:${req.ip || 'unknown'}`);
        return res.status(403).json({ error: 'That invite code is not right, or it was already used.', code: 'LESSON_CODE_WRONG' });
      }
      const { enrollment, rejoinToken } = await enrollStudent(pool, { klass, name, color, source: 'invite' });
      return admit(req, res, klass, enrollment, { rejoinToken });
    }
    const stripe = stripeConfig();
    if (!stripe.enabled) return res.status(503).json({ error: 'Paid sign-up is not open yet. Ask your instructor for an invite code.', code: 'LESSON_STRIPE_OFF' });
    const { enrollment, rejoinToken } = await enrollStudent(pool, { klass, name, color, source: 'stripe', status: 'pending' });
    const back = `${req.protocol}://${req.get('host')}/?class=${encodeURIComponent(req.params.token)}`;
    const checkout = await createCheckoutSession({
      secretKey: stripe.secretKey, priceId: klass.stripe_price_id, enrollmentId: enrollment.id,
      successUrl: `${back}&paid=1`, cancelUrl: back,
    });
    await pool.query('UPDATE lesson_enrollments SET checkout_id = $2 WHERE id = $1', [enrollment.id, checkout.id]);
    return res.status(202).json({ ...preview(klass), pending: true, checkoutUrl: checkout.url, rejoinToken });
  } catch (error) {
    return sendError(res, error);
  }
});

// Back after an earlier visit, or back from Stripe Checkout (the seat turns
// active when Stripe's webhook confirms payment; until then this says so).
lessonGuestRouter.post('/:token/rejoin', async (req, res) => {
  try {
    const klass = await classForToken(req, res);
    if (!klass) return undefined;
    const token = String(req.body?.rejoinToken || '');
    const seat = isShareTokenShape(token) ? await findEnrollmentByRejoin(pool, { classId: klass.id, token }) : null;
    if (!seat) return res.status(404).json({ error: 'Join with your name and invite code.', code: 'LESSON_SEAT_UNKNOWN' });
    if (seat.status === 'pending') return res.status(202).json({ ...preview(klass), pending: true });
    if (seat.status !== 'active') return res.status(410).json({ error: 'Your class membership has ended.', code: 'LESSON_SEAT_INACTIVE' });
    return admit(req, res, klass, seat);
  } catch (error) {
    return sendError(res, error);
  }
});

async function mySeat(req, res) {
  try {
    const guest = req.session?.guest;
    if (!guest?.enrollmentId) {
      res.status(401).json({ error: 'Join the class first.', code: 'LESSON_SEAT_REQUIRED' });
      return null;
    }
    await resolveGuestSession(pool, req.session);
    const seat = await getEnrollment(pool, guest.enrollmentId);
    const klass = seat && await getClass(pool, seat.class_id);
    if (!klass) throw Object.assign(new Error('This class no longer exists.'), { statusCode: 410 });
    return { seat, klass };
  } catch (error) {
    sendError(res, error);
    return null;
  }
}

lessonGuestRouter.get('/me/state', async (req, res) => {
  const mine = await mySeat(req, res);
  if (!mine) return;
  const { seat, klass } = mine;
  try {
    const marks = await listMarks(pool, [seat.id]);
    res.json({
      classId: klass.id,
      title: klass.title,
      you: { id: seat.id, name: seat.display_name, color: seat.color, guestId: seat.guest_id },
      boardWorkspaceId: seat.board_workspace_id,
      teacherWorkspaceId: klass.teacher_link_id ? klass.workspace_id : null,
      streamUrl: klass.stream_url,
      agentMode: klass.agent_mode,
      handRaised: Boolean(seat.hand_raised_at),
      progress: progressFor(klass.checkpoints, marks),
    });
  } catch (error) {
    sendError(res, error);
  }
});

lessonGuestRouter.post('/me/checkpoints/:checkpointId', async (req, res) => {
  const mine = await mySeat(req, res);
  if (!mine) return undefined;
  const { seat, klass } = mine;
  try {
    const step = (klass.checkpoints || []).find((item) => item.id === req.params.checkpointId);
    if (!step) return res.status(404).json({ error: 'That step is not in this lesson.' });
    await markDone(pool, { enrollmentId: seat.id, checkpointId: step.id, done: req.body?.done !== false });
    return res.json({ ok: true });
  } catch (error) {
    return sendError(res, error);
  }
});

lessonGuestRouter.post('/me/hand', async (req, res) => {
  const mine = await mySeat(req, res);
  if (!mine) return;
  try {
    await setHand(pool, { enrollmentId: mine.seat.id, raised: Boolean(req.body?.raised) });
    publishWorkspaceEvent(mine.seat.board_workspace_id, { type: 'class.changed' }, { guests: true });
    res.json({ ok: true, raised: Boolean(req.body?.raised) });
  } catch (error) {
    sendError(res, error);
  }
});
