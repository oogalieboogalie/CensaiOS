// server/routes/lessonsBilling.js
//
// Stripe's webhook for paid class seats (spec 12), mounted before the
// sign-in guard with a raw body so the signature can be checked. Stripe
// retries anything that isn't a 2xx, so only a bad signature is refused.

import express from 'express';
import pool from '../db.js';
import { createLogger } from '../logger.js';
import { handleStripeEvent, stripeConfig, verifyStripeSignature } from '../lessons/stripe.js';

const log = createLogger('lesson-billing');

export const STRIPE_WEBHOOK_PATH = '/api/billing/stripe/webhook';
export const lessonBillingRouter = express.Router();

lessonBillingRouter.post('/stripe/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  let event;
  try {
    event = verifyStripeSignature(req.body, req.get('stripe-signature'), stripeConfig().webhookSecret);
  } catch (error) {
    log.warn('stripe webhook refused', { error: error.message });
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
  try {
    const result = await handleStripeEvent(pool, event);
    log.info('stripe webhook handled', { type: event.type, action: result.action });
    return res.json({ received: true, ...result });
  } catch (error) {
    log.warn('stripe webhook failed', { type: event.type, error: error.message });
    return res.status(500).json({ error: 'Could not apply this event yet.' });
  }
});
