// Phone ping when Jules gets stuck (Alex's diagram 01: "page someone"). Off
// until the owner sets JULES_PHONE_PING_URL in .env to their own push topic,
// for example https://ntfy.sh/<a-long-secret-name> with the free ntfy app on
// the phone subscribed to it. When the overnight runner parks a task, it
// posts one short plain-text message there, the same words the Inbox shows.
import { julesStuckReport } from '../inbox/julesStuckSource.js';

/** The push address, or '' when the ping is off or the address is not https. */
export function phonePingUrl(env = process.env) {
  const raw = String(env.JULES_PHONE_PING_URL || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).protocol === 'https:' ? raw : '';
  } catch {
    return '';
  }
}

/** Title and body for one parked task. */
export function phonePingMessage(entry, repo = '') {
  const report = julesStuckReport(entry, repo);
  return { title: report.title.slice(0, 120), body: report.detail.slice(0, 900) };
}

/**
 * Post one push to the owner's phone. Resolves to 'sent', 'off' or
 * 'failed: <why>'; never throws, so a dead phone service stops nothing.
 */
export async function sendPush({ title, body, tags = 'warning' }, { env = process.env, post = globalThis.fetch } = {}) {
  const url = phonePingUrl(env);
  if (!url) return 'off';
  try {
    const res = await post(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8', Title: String(title).slice(0, 120).replace(/[^\x20-\x7E]/g, ''), Tags: tags },
      body: String(body).slice(0, 900),
    });
    return res?.ok ? 'sent' : `failed: the push service answered ${res?.status}`;
  } catch (err) {
    return `failed: ${err?.message || 'no answer'}`;
  }
}

/** The ping for one parked Jules task. */
export async function sendPhonePing(entry, { repo = '', env = process.env, post = globalThis.fetch } = {}) {
  return sendPush(phonePingMessage(entry, repo), { env, post });
}
