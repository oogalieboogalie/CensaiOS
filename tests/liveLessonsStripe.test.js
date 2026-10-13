import { jest } from '@jest/globals';
import crypto from 'node:crypto';

// Seats and classes in memory; the enroll helpers are spies so the test
// checks what Stripe events do to seats, not how boards are copied.
const seats = new Map();
const klass = { id: 'class-1', title: 'Agents', ended_at: null };
const setEnrollmentStatus = jest.fn(async (_db, { enrollmentId, status, ref }) => {
  const seat = { ...seats.get(enrollmentId), status, access_ref: ref ?? seats.get(enrollmentId).access_ref };
  seats.set(enrollmentId, seat);
  return seat;
});
jest.unstable_mockModule('../server/lessons/store.js', () => ({
  findEnrollmentByCheckout: jest.fn(async (_db, id) => [...seats.values()].find((seat) => seat.checkout_id === id) || null),
  getEnrollment: jest.fn(async (_db, id) => seats.get(id) || null),
  findEnrollmentsByAccessRef: jest.fn(async (_db, { ref }) => [...seats.values()].filter((seat) => seat.access_ref === ref)),
  getClass: jest.fn(async () => klass),
  setEnrollmentStatus,
}));
const provisionBoard = jest.fn(async (_db, _klass, seat) => seat);
const closeSeat = jest.fn(async (_db, seat) => setEnrollmentStatus(null, { enrollmentId: seat.id, status: 'lapsed' }));
const reopenSeat = jest.fn(async (_db, _klass, seat) => setEnrollmentStatus(null, { enrollmentId: seat.id, status: 'active' }));
jest.unstable_mockModule('../server/lessons/enroll.js', () => ({ provisionBoard, closeSeat, reopenSeat }));

const { createCheckoutSession, handleStripeEvent, stripeConfig, verifyStripeSignature } = await import('../server/lessons/stripe.js');

const SECRET = 'whsec_test_secret';
function sign(body, { secret = SECRET, at = Math.floor(Date.now() / 1000) } = {}) {
  const v1 = crypto.createHmac('sha256', secret).update(`${at}.${body}`).digest('hex');
  return `t=${at},v1=${v1}`;
}

beforeEach(() => {
  seats.clear();
  jest.clearAllMocks();
});

describe('Stripe webhook signatures', () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } });

  test('a correctly signed body is parsed', () => {
    expect(verifyStripeSignature(Buffer.from(body), sign(body), SECRET).id).toBe('evt_1');
  });

  test('a wrong secret, an edited body or an old timestamp is refused', () => {
    expect(() => verifyStripeSignature(body, sign(body, { secret: 'whsec_other' }), SECRET)).toThrow(/Bad Stripe signature/);
    expect(() => verifyStripeSignature(body.replace('sub_1', 'sub_2'), sign(body), SECRET)).toThrow(/Bad Stripe signature/);
    expect(() => verifyStripeSignature(body, sign(body, { at: Math.floor(Date.now() / 1000) - 3600 }), SECRET)).toThrow(/Stale/);
    expect(() => verifyStripeSignature(body, 'garbage', SECRET)).toThrow(/Missing/);
    expect(() => verifyStripeSignature(body, sign(body), '')).toThrow(/not set up/);
  });

  test('Stripe stays off until both keys are set', () => {
    expect(stripeConfig({}).enabled).toBe(false);
    expect(stripeConfig({ STRIPE_SECRET_KEY: 'sk_test_1' }).enabled).toBe(false);
    expect(stripeConfig({ STRIPE_SECRET_KEY: 'sk_test_1', STRIPE_WEBHOOK_SECRET: SECRET }).enabled).toBe(true);
  });
});

test('checkout asks Stripe for a subscription tied to the seat', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({ id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' }) }));
  const session = await createCheckoutSession({
    secretKey: 'sk_test_1', priceId: 'price_123456', enrollmentId: 'seat-1',
    successUrl: 'https://os.censai.app/?class=t&paid=1', cancelUrl: 'https://os.censai.app/?class=t', fetchImpl,
  });
  expect(session).toEqual({ id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' });
  const [url, init] = fetchImpl.mock.calls[0];
  expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
  expect(init.headers.Authorization).toBe('Bearer sk_test_1');
  const form = new URLSearchParams(init.body);
  expect(form.get('mode')).toBe('subscription');
  expect(form.get('line_items[0][price]')).toBe('price_123456');
  expect(form.get('client_reference_id')).toBe('seat-1');
});

describe('Stripe events and seats', () => {
  test('a completed checkout opens the pending seat and records the subscription', async () => {
    seats.set('seat-1', { id: 'seat-1', class_id: 'class-1', status: 'pending', checkout_id: 'cs_1' });
    const result = await handleStripeEvent(null, { type: 'checkout.session.completed', data: { object: { id: 'cs_1', subscription: 'sub_1' } } });
    expect(result).toEqual({ action: 'activated', enrollmentId: 'seat-1' });
    expect(seats.get('seat-1')).toMatchObject({ status: 'active', access_ref: 'sub_1' });
    expect(provisionBoard).toHaveBeenCalledTimes(1);
  });

  test('a repeated checkout event changes nothing', async () => {
    seats.set('seat-1', { id: 'seat-1', class_id: 'class-1', status: 'active', checkout_id: 'cs_1' });
    expect((await handleStripeEvent(null, { type: 'checkout.session.completed', data: { object: { id: 'cs_1' } } })).action).toBe('unchanged');
    expect(provisionBoard).not.toHaveBeenCalled();
  });

  test('a cancelled subscription ends the seat; paying again reopens it', async () => {
    seats.set('seat-1', { id: 'seat-1', class_id: 'class-1', status: 'active', access_ref: 'sub_1' });
    await handleStripeEvent(null, { type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } });
    expect(closeSeat).toHaveBeenCalledTimes(1);
    expect(seats.get('seat-1').status).toBe('lapsed');
    await handleStripeEvent(null, { type: 'customer.subscription.updated', data: { object: { id: 'sub_1', status: 'active' } } });
    expect(reopenSeat).toHaveBeenCalledTimes(1);
    expect(seats.get('seat-1').status).toBe('active');
  });

  test('past_due keeps the seat while Stripe retries; unpaid ends it', async () => {
    seats.set('seat-1', { id: 'seat-1', class_id: 'class-1', status: 'active', access_ref: 'sub_1' });
    await handleStripeEvent(null, { type: 'customer.subscription.updated', data: { object: { id: 'sub_1', status: 'past_due' } } });
    expect(closeSeat).not.toHaveBeenCalled();
    await handleStripeEvent(null, { type: 'customer.subscription.updated', data: { object: { id: 'sub_1', status: 'unpaid' } } });
    expect(closeSeat).toHaveBeenCalledTimes(1);
  });
});
