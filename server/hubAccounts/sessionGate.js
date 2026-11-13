// A hub password does not open a Homebase session by itself. The owner has
// to already know this email (an account here, the allow list, or the first
// account on this computer) or has turned on public signups.
import { getAuthAccessPolicy, resolveUserAccess } from '../security/authPolicy.js';

export function hubSessionDecision({
  email,
  existingUser = null,
  userCount = 0,
  env = process.env,
  runtimeMode,
} = {}) {
  const normalized = String(email || '').trim().toLowerCase();
  const policy = getAuthAccessPolicy({ env, runtimeMode });
  if (existingUser) return { allowed: true, role: existingUser.role || 'user' };
  if (normalized && policy.adminUsers.has(normalized)) return { allowed: true, role: 'admin' };
  if (normalized && policy.allowedUsers.has(normalized)) return { allowed: true, role: 'user' };
  if (policy.publicSignups) {
    const access = resolveUserAccess({ email: normalized, existingUser, userCount, env, runtimeMode });
    return access.allowed
      ? { allowed: true, role: access.role || 'user' }
      : { allowed: false, reason: access.reason || 'invite_required' };
  }
  // The first account is the owner only on this computer. A cloud or private
  // server does not hand that role to whoever signs up first.
  if (normalized && policy.local && Number(userCount) === 0) return { allowed: true, role: 'admin' };
  return { allowed: false, reason: 'invite_required' };
}

export async function lookupHubSessionUser(db, email, options = {}) {
  const normalized = String(email || '').trim().toLowerCase();
  const found = normalized
    ? await db.query('SELECT id, email, name, role FROM users WHERE email = $1', [normalized])
    : { rows: [] };
  const existingUser = found.rows[0] || null;
  let userCount = 0;
  if (!existingUser) {
    const count = await db.query('SELECT COUNT(*)::int AS count FROM users');
    userCount = Number(count.rows[0]?.count || 0);
  }
  return hubSessionDecision({ email: normalized, existingUser, userCount, ...options });
}
