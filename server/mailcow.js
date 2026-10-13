// ─── mailcow API Client ──────────────────────────────────────────────────────
// Thin authenticated fetch wrapper for the mailcow-dockerized REST API.
// All requests use X-API-Key header. Base URL + key come from env.
// Gracefully returns an error object when not configured.

import { getSecret } from './secrets.js';

function getConfig() {
  const url = (getSecret('MAILCOW_URL') || process.env.MAILCOW_URL || '').replace(/\/+$/, '');
  const key = getSecret('MAILCOW_API_KEY') || process.env.MAILCOW_API_KEY || '';
  return { url, key };
}

export function mailcowConfigured() {
  const { url, key } = getConfig();
  return Boolean(url && key);
}

function notConfiguredError() {
  return new Error(
    'Mailcow addon is not configured. Set MAILCOW_URL and MAILCOW_API_KEY in your .env file. ' +
    'Generate an API key in your mailcow UI under Configuration → Access → Edit administrator details → API.'
  );
}

export async function mailcowGet(path) {
  const { url, key } = getConfig();
  if (!url || !key) throw notConfiguredError();

  const res = await fetch(`${url}/api/v1${path}`, {
    headers: {
      'X-API-Key': key,
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`mailcow API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function mailcowPost(path, body) {
  const { url, key } = getConfig();
  if (!url || !key) throw notConfiguredError();

  const res = await fetch(`${url}/api/v1${path}`, {
    method: 'POST',
    headers: {
      'X-API-Key': key,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`mailcow API error ${res.status}: ${text}`);
  }
  // mailcow returns arrays of result objects for most mutations
  return res.json();
}

export function getMailcowBaseUrl() {
  return getConfig().url || null;
}
