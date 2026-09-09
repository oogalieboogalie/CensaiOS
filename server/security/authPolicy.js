import { getRuntimeMode, RUNTIME_MODES } from '../middleware/runtimeMode.js';

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function emailSet(value) {
  return new Set(String(value || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean));
}

export function getAuthAccessPolicy({ env = process.env, runtimeMode = getRuntimeMode() } = {}) {
  return {
    runtimeMode,
    local: runtimeMode === RUNTIME_MODES.LOCAL_DESKTOP,
    allowedUsers: emailSet(env.ALLOWED_USERS),
    adminUsers: emailSet(env.CENSAI_ADMIN_EMAILS),
    publicSignups: parseBoolean(env.CENSAI_PUBLIC_SIGNUPS),
  };
}

export function resolveUserAccess({
  email,
  existingUser = null,
  userCount = 0,
  env = process.env,
  runtimeMode = getRuntimeMode(),
} = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const policy = getAuthAccessPolicy({ env, runtimeMode });
  if (!normalizedEmail) return { allowed: false, reason: 'email_required' };

  if (policy.local) {
    if (existingUser) return { allowed: true, role: existingUser.role };
    if (Number(userCount) === 0) return { allowed: true, role: 'admin' };
    if (policy.allowedUsers.size > 0 && !policy.allowedUsers.has(normalizedEmail)) {
      return { allowed: false, reason: 'invite_required' };
    }
    return { allowed: true, role: 'user' };
  }

  const explicitlyAdmin = policy.adminUsers.has(normalizedEmail);
  const explicitlyAllowed = policy.allowedUsers.has(normalizedEmail);
  if (!explicitlyAdmin && !explicitlyAllowed && !policy.publicSignups) {
    return { allowed: false, reason: 'invite_required' };
  }

  return {
    allowed: true,
    role: existingUser?.role || (explicitlyAdmin ? 'admin' : 'user'),
  };
}

export function isSessionAuthorized(session, options = {}) {
  if (!session?.userId) return false;
  const policy = getAuthAccessPolicy(options);
  if (policy.local || policy.publicSignups) return true;
  const email = String(session.userEmail || '').trim().toLowerCase();
  return policy.allowedUsers.has(email) || policy.adminUsers.has(email);
}

export function isDeveloperLoginAllowed({
  env = process.env,
  runtimeMode = getRuntimeMode(),
  oauthConfigured = false,
} = {}) {
  if (runtimeMode === RUNTIME_MODES.CLOUD_SAAS) return false;
  const explicit = parseBoolean(env.CENSAI_ALLOW_DEVELOPER_LOGIN);
  if (runtimeMode === RUNTIME_MODES.PRIVATE_SERVER) return explicit;
  if (String(env.CENSAI_ALLOW_DEVELOPER_LOGIN || '').trim().toLowerCase() === 'false') return false;
  return !(oauthConfigured && env.NODE_ENV === 'production');
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
