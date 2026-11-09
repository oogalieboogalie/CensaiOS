// The email-confirm link is a one-time server token. Only its hash is stored.
// The raw link goes to the mail webhook when one is configured, and otherwise
// to the server log on this computer so the owner can open it. It is never
// put in the signup response.
import crypto from 'crypto';
import { createLogger } from '../logger.js';
import { logAuthProblem } from '../security/authLog.js';

const log = createLogger('hub-auth');

export function hashConfirmToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function hubConfirmUrl(token, env = process.env) {
  const origin = env.APP_ORIGIN || 'http://localhost:5173';
  return `${origin}/confirm-email?token=${token}`;
}

export async function deliverHubConfirmLink({
  accountId, username, emailEncrypted, emailHash, token, env = process.env,
}) {
  const confirmUrl = hubConfirmUrl(token, env);
  const webhook = env.N8N_HUB_SIGNUP_WEBHOOK;
  if (webhook) {
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'hub_account_signup',
          username,
          emailCipher: emailEncrypted,
          emailHash,
          confirmUrl,
          timestamp: new Date().toISOString(),
        }),
      });
      return;
    } catch (err) {
      logAuthProblem('hub sign-up: n8n webhook failed', err, 'warn');
    }
  }
  log.info('hub sign-up waiting for the owner to confirm', { accountId, confirmUrl });
}
