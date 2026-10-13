// server/lessons/stripe.js
//
// Paid seats through Stripe, without the Stripe SDK: Checkout for the
// subscription, and webhooks to keep each seat in step with its
// subscription. Off until STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are
// set; the class then needs a real price id (price_...) from the
// instructor's Stripe dashboard. Card numbers never reach this server.

import crypto from 'node:crypto';
import { closeSeat, provisionBoard, reopenSeat } from './enroll.js';
import { findEnrollmentByCheckout, findEnrollmentsByAccessRef, getClass, getEnrollment, setEnrollmentStatus } from './store.js';

const STRIPE_API = 'https://api.stripe.com/v1';
const DEFAULT_TOLERANCE_SECONDS = 300;
// Subscription states that still hold a seat. past_due keeps it while
// Stripe retries the card; anything else ends it.
const SEAT_HOLDING = new Set(['active', 'trialing', 'past_due']);

export function stripeConfig(env = process.env) {
  const secretKey = env.STRIPE_SECRET_KEY || '';
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET || '';
  return { secretKey, webhookSecret, enabled: Boolean(secretKey && webhookSecret) };
}

/**
 * Check a Stripe-Signature header (t=...,v1=...) against the raw body.
 * Throws on a bad or stale signature.
 */
export function verifyStripeSignature(payload, header, secret, {
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS, now = Date.now(),
} = {}) {
  if (!secret) throw Object.assign(new Error('Stripe webhooks are not set up'), { statusCode: 503 });
  const parts = String(header || '').split(',').map((part) => part.trim().split('='));
  const timestamp = Number(parts.find(([key]) => key === 't')?.[1]);
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!Number.isFinite(timestamp) || !signatures.length) {
    throw Object.assign(new Error('Missing Stripe signature'), { statusCode: 400 });
  }
  if (Math.abs(now / 1000 - timestamp) > toleranceSeconds) {
    throw Object.assign(new Error('Stale Stripe signature'), { statusCode: 400 });
  }
  const body = Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload);
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest();
  const match = signatures.some((signature) => {
    const given = Buffer.from(signature, 'hex');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
  if (!match) throw Object.assign(new Error('Bad Stripe signature'), { statusCode: 400 });
  return JSON.parse(body);
}

/** Start a subscription Checkout for one pending seat. Returns { id, url }. */
export async function createCheckoutSession({
  secretKey, priceId, successUrl, cancelUrl, enrollmentId, fetchImpl = fetch,
}) {
  const form = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: String(enrollmentId),
    'metadata[lesson_enrollment]': String(enrollmentId),
    'subscription_data[metadata][lesson_enrollment]': String(enrollmentId),
  });
  const response = await fetchImpl(`${STRIPE_API}/checkout/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.url) {
    throw Object.assign(new Error(payload.error?.message || 'Stripe did not start the checkout'), { statusCode: 502 });
  }
  return { id: payload.id, url: payload.url };
}

async function seatForCheckout(db, session) {
  return (session.id && await findEnrollmentByCheckout(db, session.id))
    || (session.client_reference_id && await getEnrollment(db, session.client_reference_id))
    || null;
}

/**
 * Apply one verified Stripe event to the seats it concerns. Returns a short
 * description of what changed, for the log and the tests.
 */
export async function handleStripeEvent(db, event) {
  const object = event?.data?.object || {};
  if (event?.type === 'checkout.session.completed') {
    const seat = await seatForCheckout(db, object);
    if (!seat) return { action: 'ignored', reason: 'no seat for this checkout' };
    if (seat.status !== 'pending') return { action: 'unchanged', enrollmentId: seat.id };
    const klass = await getClass(db, seat.class_id);
    if (!klass || klass.ended_at) return { action: 'ignored', reason: 'class ended' };
    const active = await setEnrollmentStatus(db, { enrollmentId: seat.id, status: 'active', ref: object.subscription || null });
    await provisionBoard(db, klass, active);
    return { action: 'activated', enrollmentId: seat.id };
  }
  if (event?.type === 'customer.subscription.updated' || event?.type === 'customer.subscription.deleted') {
    const holding = event.type === 'customer.subscription.updated' && SEAT_HOLDING.has(object.status);
    const seats = object.id ? await findEnrollmentsByAccessRef(db, { source: 'stripe', ref: object.id }) : [];
    const changed = [];
    for (const seat of seats) {
      if (!holding && seat.status === 'active') {
        await closeSeat(db, seat);
        changed.push({ action: 'lapsed', enrollmentId: seat.id });
      } else if (holding && seat.status === 'lapsed') {
        const klass = await getClass(db, seat.class_id);
        if (klass && !klass.ended_at) {
          await reopenSeat(db, klass, seat, { ref: object.id });
          changed.push({ action: 'reopened', enrollmentId: seat.id });
        }
      }
    }
    return changed.length ? { action: 'seats', changed } : { action: 'unchanged' };
  }
  return { action: 'ignored', reason: `unhandled ${event?.type}` };
}
