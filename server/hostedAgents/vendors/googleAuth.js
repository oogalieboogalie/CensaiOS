// Google Cloud credentials for Agent Engine, from the person's own vault
// slot "googlecloud". Two kinds work:
//   - a service account key file (the JSON Google downloads): censaiOS signs
//     a short token request with it and keeps the hour-long token in memory
//   - an express mode API key (AIza...): sent as x-goog-api-key, and the
//     agent is addressed without a project or location
// Nothing here is written to disk or logged.

import crypto from 'node:crypto';
import { netFetch } from '../../security/publicAddress.js';
import { HostedAgentError, vendorJson } from '../http.js';

const TOKEN_URL = () => process.env.HOSTED_GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const tokens = new Map();

const b64url = (value) => Buffer.from(value).toString('base64url');

/** What kind of Google credential the saved value is. */
export function readGoogleCredential(saved) {
  const text = String(saved || '').trim();
  if (/^AIza[0-9A-Za-z_-]{20,}$/.test(text)) return { kind: 'apiKey', apiKey: text };
  if (text.startsWith('{')) {
    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    if (json?.type === 'service_account' && json.client_email && json.private_key) {
      return { kind: 'serviceAccount', email: String(json.client_email), privateKey: String(json.private_key), projectId: json.project_id || null };
    }
  }
  throw new HostedAgentError('The Google Cloud key in Settings → Vault should be a service account key file (the whole JSON) or an express mode API key (AIza...).', 400, 'HOSTED_AGENT_BAD_KEY');
}

export function signedAssertion({ email, privateKey }, now = Math.floor(Date.now() / 1000)) {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: email, scope: SCOPE, aud: TOKEN_URL(), iat: now, exp: now + 3600 }));
  let signature;
  try {
    signature = crypto.createSign('RSA-SHA256').update(`${head}.${claims}`).sign(privateKey).toString('base64url');
  } catch {
    throw new HostedAgentError('The service account key could not be read. Paste the whole JSON file Google gave you.', 400, 'HOSTED_AGENT_BAD_KEY');
  }
  return `${head}.${claims}.${signature}`;
}

/** Request headers for one Agent Engine call. */
export async function googleAuthHeaders(credential, { fetchImpl = netFetch, signal = null } = {}) {
  if (credential.kind === 'apiKey') return { 'x-goog-api-key': credential.apiKey };
  const cacheKey = crypto.createHash('sha256').update(`${credential.email}\n${credential.privateKey}`).digest('hex');
  const cached = tokens.get(cacheKey);
  if (cached && cached.until > Date.now()) return { Authorization: `Bearer ${cached.token}` };
  const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signedAssertion(credential) }).toString();
  const answer = await vendorJson({
    url: TOKEN_URL(), method: 'POST', body, label: 'Google sign-in', fetchImpl, signal, timeoutMs: 20_000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!answer.access_token) throw new HostedAgentError('Google did not give a sign-in token for that service account.', 401, 'HOSTED_AGENT_KEY_REFUSED');
  tokens.set(cacheKey, { token: answer.access_token, until: Date.now() + Math.max(60, Number(answer.expires_in) - 300) * 1000 });
  return { Authorization: `Bearer ${answer.access_token}` };
}

export function forgetGoogleTokens() {
  tokens.clear();
}
