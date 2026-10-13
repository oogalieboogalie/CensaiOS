import { jest } from '@jest/globals';
import express from 'express';
import session from 'express-session';
import request from 'supertest';

// The student join flow with the database swapped for spies.
const TOKEN = 'a'.repeat(43);
let klass;
const consumeInviteCode = jest.fn(async (_db, { code }) => code === 'GOOD-CODE');
const enrollStudent = jest.fn(async (_db, { name }) => ({
  enrollment: { id: 'seat-1', class_id: 'class-1', guest_id: 'guest-1', display_name: name, color: null, board_workspace_id: 'class-seat-1', board_link_id: 'link-seat' },
  rejoinToken: 'r'.repeat(43),
}));
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(async () => ({ rows: [] })), on: jest.fn() } }));
const realEnroll = await import('../server/lessons/enroll.js');
const realStore = await import('../server/lessons/store.js');
jest.unstable_mockModule('../server/lessons/store.js', () => ({
  ...realStore,
  consumeInviteCode,
  findClassByToken: jest.fn(async (_db, token) => (token === TOKEN ? klass : null)),
  findEnrollmentByRejoin: jest.fn(async () => null),
  getClass: jest.fn(), getEnrollment: jest.fn(), listMarks: jest.fn(), markDone: jest.fn(), setHand: jest.fn(),
}));
jest.unstable_mockModule('../server/lessons/enroll.js', () => ({
  ...realEnroll,
  enrollStudent,
  studentGuestPass: (k, seat) => ({ linkId: seat.board_link_id, workspaceId: seat.board_workspace_id, guestId: seat.guest_id, enrollmentId: seat.id, classLinks: { [k.workspace_id]: k.teacher_link_id } }),
}));

const { lessonGuestRouter } = await import('../server/routes/lessonsGuest.js');
const { __resetGuestJoinLimitForTests } = await import('../server/routes/guestLinks.js');

function app() {
  const server = express();
  server.use(express.json());
  server.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false }));
  server.use('/api/guest/classes', lessonGuestRouter);
  server.get('/whoami', (req, res) => res.json(req.session.guest || null));
  return server;
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetGuestJoinLimitForTests();
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  klass = {
    id: 'class-1', workspace_id: 'lesson-board', teacher_link_id: 'link-teach', title: 'Agents', checkpoints: [{ id: '1-a', title: 'A' }],
    seat_limit: 16, seats_taken: 0, gate: 'invite', ended_at: null, workspace_name: 'Lesson', instructor_name: 'Dana',
  };
});

test('the class preview says how to get in without exposing the board', async () => {
  const res = await request(app()).get(`/api/guest/classes/${TOKEN}`);
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ title: 'Agents', gate: 'invite', seatsLeft: 16, steps: 1 });
  expect(JSON.stringify(res.body)).not.toContain('lesson-board');
  expect((await request(app()).get(`/api/guest/classes/${'b'.repeat(43)}`)).status).toBe(404);
});

test('a wrong code is refused; the right one seats the student with a class pass', async () => {
  const agent = request.agent(app());
  const wrong = await agent.post(`/api/guest/classes/${TOKEN}/join`).send({ name: 'Sam', code: 'NOPE' });
  expect(wrong.status).toBe(403);
  expect(enrollStudent).not.toHaveBeenCalled();
  const ok = await agent.post(`/api/guest/classes/${TOKEN}/join`).send({ name: 'Sam', code: 'GOOD-CODE' });
  expect(ok.status).toBe(201);
  expect(ok.body.rejoinToken).toHaveLength(43);
  const pass = (await agent.get('/whoami')).body;
  expect(pass).toMatchObject({ linkId: 'link-seat', enrollmentId: 'seat-1', classLinks: { 'lesson-board': 'link-teach' } });
});

test('a full or ended class takes no one and spends no code', async () => {
  klass.seats_taken = 16;
  const full = await request(app()).post(`/api/guest/classes/${TOKEN}/join`).send({ name: 'Sam', code: 'GOOD-CODE' });
  expect(full.status).toBe(409);
  expect(consumeInviteCode).not.toHaveBeenCalled();
  klass.ended_at = new Date().toISOString();
  expect((await request(app()).post(`/api/guest/classes/${TOKEN}/join`).send({ name: 'Sam', code: 'GOOD-CODE' })).status).toBe(404);
});

test('a paid class says so plainly until Stripe is connected', async () => {
  klass.gate = 'stripe';
  const res = await request(app()).post(`/api/guest/classes/${TOKEN}/join`).send({ name: 'Sam' });
  expect(res.status).toBe(503);
  expect(res.body.code).toBe('LESSON_STRIPE_OFF');
  expect(enrollStudent).not.toHaveBeenCalled();
});
