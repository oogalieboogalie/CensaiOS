import { jest } from '@jest/globals';
import crypto from 'node:crypto';
import request from 'supertest';

// Stripe's webhook for paid class seats (server/routes/lessonsBilling.js)
// through a real request, with the real signature check.
//
// Nobody signs in here: Stripe calls it, so "signed out is refused" becomes
// "a call without Stripe's signature is refused". There is no read and no
// per-person data a teammate could reach, so cases 2 and 4 do not apply; the
// change case is a signed event lapsing the seat it names (Pat's seat in a
// Testco class), and leaving Sam's seat alone.

jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(), on: jest.fn(), end: jest.fn() } }));

const seats = new Map();
const setEnrollmentStatus = jest.fn(async (_db, { enrollmentId, status }) => {
  const seat = { ...seats.get(enrollmentId), status };
  seats.set(enrollmentId, seat);
  return seat;
});
jest.unstable_mockModule('../server/lessons/store.js', () => ({
  findEnrollmentByCheckout: jest.fn(async () => null),
  getEnrollment: jest.fn(async (_db, id) => seats.get(id) || null),
  findEnrollmentsByAccessRef: jest.fn(async (_db, { ref }) => [...seats.values()].filter((seat) => seat.access_ref === ref)),
  getClass: jest.fn(async () => ({ id: 'class-testco', title: 'Testco onboarding', ended_at: null })),
  setEnrollmentStatus,
}));
const closeSeat = jest.fn(async (_db, seat) => setEnrollmentStatus(null, { enrollmentId: seat.id, status: 'lapsed' }));
jest.unstable_mockModule('../server/lessons/enroll.js', () => ({ provisionBoard: jest.fn(), closeSeat, reopenSeat: jest.fn() }));

const SECRET = 'whsec_testco_secret';
process.env.STRIPE_WEBHOOK_SECRET = SECRET;

const { lessonBillingRouter } = await import('../server/routes/lessonsBilling.js');
const express = (await import('express')).default;

const app = express();
app.use('/api/billing', lessonBillingRouter);

function sign(body, secret = SECRET) {
  const at = Math.floor(Date.now() / 1000);
  return `t=${at},v1=${crypto.createHmac('sha256', secret).update(`${at}.${body}`).digest('hex')}`;
}
const lapse = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.deleted', data: { object: { id: 'sub_pat' } } });
const post = (body, signature) => {
  const req = request(app).post('/api/billing/stripe/webhook').set('Content-Type', 'application/json');
  return (signature ? req.set('Stripe-Signature', signature) : req).send(body);
};

beforeEach(() => {
  seats.clear();
  seats.set('seat-pat', { id: 'seat-pat', user_id: 1, class_id: 'class-testco', status: 'active', access_ref: 'sub_pat' });
  seats.set('seat-sam', { id: 'seat-sam', user_id: 2, class_id: 'class-testco', status: 'active', access_ref: 'sub_sam' });
  jest.clearAllMocks();
});

afterAll(() => { delete process.env.STRIPE_WEBHOOK_SECRET; });

describe('lesson billing webhook', () => {
  test('a call without Stripe\'s signature, or with a wrong one, is refused and changes nothing', async () => {
    expect((await post(lapse)).status).toBe(400);
    expect((await post(lapse, sign(lapse, 'whsec_someone_else'))).status).toBe(400);
    expect(closeSeat).not.toHaveBeenCalled();
    expect(seats.get('seat-pat').status).toBe('active');
  });

  test('a signed cancellation lapses only the seat it names', async () => {
    const res = await post(lapse, sign(lapse));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, action: 'seats', changed: [{ action: 'lapsed', enrollmentId: 'seat-pat' }] });
    expect(seats.get('seat-pat').status).toBe('lapsed');
    expect(seats.get('seat-sam').status).toBe('active');
  });

  test('an event type it does not handle is still acknowledged so Stripe stops retrying', async () => {
    const body = JSON.stringify({ id: 'evt_2', type: 'invoice.created', data: { object: {} } });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, action: 'ignored' });
  });
});
