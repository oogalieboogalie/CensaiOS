import net from 'node:net';
import { getRuntimeMode, RUNTIME_MODES } from '../middleware/runtimeMode.js';
import { currentSignInDomains, emailDomain } from '../signInDomains/store.js';
import { cameThroughLocalProxy } from '../webOs/localProxy.js';

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function emailSet(value) {
  return new Set(String(value || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean));
}

export function getAuthAccessPolicy({
  env = process.env,
  runtimeMode = getRuntimeMode(),
  allowedDomains = currentSignInDomains(),
} = {}) {
  return {
    runtimeMode,
    local: runtimeMode === RUNTIME_MODES.LOCAL_DESKTOP,
    allowedUsers: emailSet(env.ALLOWED_USERS),
    adminUsers: emailSet(env.CENSAI_ADMIN_EMAILS),
    // Who can sign up, set by an admin in Settings, Sharing (server/signInDomains).
    allowedDomains: new Set(allowedDomains),
    publicSignups: parseBoolean(env.CENSAI_PUBLIC_SIGNUPS),
  };
}

/** Named in ALLOWED_USERS, or at a domain an admin let in. Domains only ever add people. */
function isAllowedEmail(policy, email) {
  return policy.allowedUsers.has(email) || policy.allowedDomains.has(emailDomain(email));
}

export function resolveUserAccess({
  email,
  existingUser = null,
  userCount = 0,
  env = process.env,
  runtimeMode = getRuntimeMode(),
  allowedDomains,
} = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const policy = getAuthAccessPolicy({ env, runtimeMode, allowedDomains });
  if (!normalizedEmail) return { allowed: false, reason: 'email_required' };

  if (policy.local) {
    if (existingUser) return { allowed: true, role: existingUser.role };
    if (Number(userCount) === 0) return { allowed: true, role: 'admin' };
    if (policy.allowedUsers.size > 0 && !isAllowedEmail(policy, normalizedEmail)) {
      return { allowed: false, reason: 'invite_required' };
    }
    return { allowed: true, role: 'user' };
  }

  const explicitlyAdmin = policy.adminUsers.has(normalizedEmail);
  const explicitlyAllowed = isAllowedEmail(policy, normalizedEmail);
  if (!explicitlyAdmin && !explicitlyAllowed && !policy.publicSignups) {
    return { allowed: false, reason: 'invite_required' };
  }

  return {
    allowed: true,
    role: existingUser?.role || (explicitlyAdmin ? 'admin' : 'user'),
  };
}

export function isSessionAuthorized(session, options = {}) {
  // Hub sign-in keeps its own id for the hub routes. It is not a Homebase user,
  // so on this computer it must not pass the API guard the way any userId would.
  // A session from before that mark was stored still carries a hub account UUID.
  // users.id is an integer, so a non-integer id is not a Homebase user either.
  if (!session?.userId || session.hubAccount || !Number.isInteger(Number(session.userId))) return false;
  const policy = getAuthAccessPolicy(options);
  if (policy.local || policy.publicSignups) return true;
  const email = String(session.userEmail || '').trim().toLowerCase();
  return isAllowedEmail(policy, email) || policy.adminUsers.has(email);
}

export function isDeveloperLoginAllowed({
  env = process.env,
  runtimeMode = getRuntimeMode(),
  oauthConfigured = false,
} = {}) {
  // Passwordless email sign-in is off unless this install opts in.
  // Cloud never honors the flag. With the flag on, a local install still
  // refuses once Google sign-in is configured in production.
  if (runtimeMode === RUNTIME_MODES.CLOUD_SAAS) return false;
  if (!parseBoolean(env.CENSAI_ALLOW_DEVELOPER_LOGIN)) return false;
  if (runtimeMode === RUNTIME_MODES.PRIVATE_SERVER) return true;
  return !(oauthConfigured && env.NODE_ENV === 'production');
}

function isLoopbackAddress(address) {
  const value = String(address || '').trim().toLowerCase();
  if (value === '::1') return true;
  const v4 = value.startsWith('::ffff:') ? value.slice('::ffff:'.length) : value;
  if (net.isIP(v4) !== 4) return false;
  return v4.startsWith('127.');
}

const PROXY_HEADERS = [
  'x-forwarded-for',
  'forwarded',
  'x-real-ip',
  'x-forwarded-host',
  'x-forwarded-proto',
  'cf-connecting-ip',
  'true-client-ip',
  'via',
  'tailscale-user-login',
];

function headerValue(req, name) {
  if (typeof req?.get === 'function') {
    const viaGet = req.get(name);
    if (viaGet !== undefined && viaGet !== null) return viaGet;
  }
  const headers = req?.headers;
  if (!headers || typeof headers !== 'object') return undefined;
  const wanted = name.toLowerCase();
  const key = Object.keys(headers).find((item) => item.toLowerCase() === wanted);
  return key === undefined ? undefined : headers[key];
}

function carriesProxyHeader(req) {
  return PROXY_HEADERS.some((name) => headerValue(req, name) !== undefined);
}

function hostName(req) {
  const value = String(headerValue(req, 'host') || '').trim().toLowerCase();
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    return end === -1 ? value : value.slice(0, end + 1);
  }
  return value.split(':')[0];
}

function isLoopbackHostName(name) {
  if (name === 'localhost' || name === '::1' || name === '[::1]') return true;
  return net.isIP(name) === 4 && name.startsWith('127.');
}

/**
 * Passwordless email sign-in is only for a connection from this machine.
 * A tunnel (ssh -R, socat, nginx, Caddy, Tailscale, cloudflared) also
 * arrives on a loopback socket. Any proxy header, an empty header included,
 * or a Host that is not localhost / 127.x / [::1], is refused before the
 * socket is checked. The socket then has to be loopback (127.0.0.0/8, ::1,
 * or ::ffff:127.x).
 */
export function isDeveloperSignInOnThisComputer(req) {
  if (carriesProxyHeader(req)) return false;
  const host = hostName(req);
  if (!host) return false;
  if (!isLoopbackHostName(host)) return false;
  return isLoopbackAddress(req?.socket?.remoteAddress);
}

export async function findOrCreateAuthorizedUser({
  db,
  email,
  name,
  env = process.env,
  runtimeMode = getRuntimeMode(),
}) {
  const existing = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  const existingUser = existing.rows[0] || null;
  let userCount = 0;
  if (!existingUser) {
    const count = await db.query('SELECT COUNT(*)::int as count FROM users');
    userCount = count.rows[0]?.count || 0;
  }

  const access = resolveUserAccess({ email, existingUser, userCount, env, runtimeMode });
  if (!access.allowed) return access;
  if (existingUser) return { ...access, user: existingUser };

  const inserted = await db.query(
    'INSERT INTO users (email, name, role) VALUES ($1, $2, $3) RETURNING *',
    [email, name || email.split('@')[0], access.role]
  );
  return { ...access, user: inserted.rows[0] };
}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function hostnameOf(host) {
  const value = String(host || '').trim().toLowerCase();
  if (value.startsWith('[')) return value.slice(0, value.indexOf(']') + 1);
  return value.split(':')[0];
}

/**
 * One-click sign-in for censaiOS on this computer (the laptop install). Only
 * for a local_desktop server, only when that sign-in isn't switched off on
 * purpose, and only from this same machine to a localhost address.
 */
export function isLocalSignInAllowed(req, {
  env = process.env,
  runtimeMode = getRuntimeMode(),
  oauthConfigured = false,
} = {}) {
  if (runtimeMode !== RUNTIME_MODES.LOCAL_DESKTOP) return false;
  if (String(env.CENSAI_ALLOW_DEVELOPER_LOGIN || '').trim().toLowerCase() === 'false') return false;
  if (oauthConfigured && env.NODE_ENV === 'production') return false;
  // A reverse proxy on this computer connects from 127.0.0.1. That is not
  // the owner's window, so one-click sign-in stays off the public address.
  if (cameThroughLocalProxy(req)) return false;
  if (!isLoopbackAddress(req?.socket?.remoteAddress)) return false;
  return LOCAL_HOSTNAMES.has(hostnameOf(req?.get?.('host') ?? req?.headers?.host));
}

export const LOCAL_OWNER_EMAIL = 'owner@this-computer.local';

/** Signs in as this computer's owner: the first admin, made on first use. */
export async function findOrCreateLocalOwner({ db, name, env = process.env, runtimeMode = getRuntimeMode() }) {
  const admin = await db.query("SELECT * FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
  if (admin.rows[0]) return { allowed: true, role: 'admin', user: admin.rows[0] };
  const cleanName = String(name || '').trim().slice(0, 80) || 'Owner';
  return findOrCreateAuthorizedUser({ db, email: LOCAL_OWNER_EMAIL, name: cleanName, env, runtimeMode });
}
