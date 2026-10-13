import crypto from 'crypto';

export const MIN_RUNNER_SECRET_LENGTH = 32;

export function runnerSecretStatus(value) {
  const secret = String(value || '').trim();
  if (!secret) {
    return { valid: false, code: 'RUNNER_SECRET_MISSING', message: 'RUNNER_SECRET is required.' };
  }
  if (secret.length < MIN_RUNNER_SECRET_LENGTH) {
    return {
      valid: false,
      code: 'RUNNER_SECRET_WEAK',
      message: `RUNNER_SECRET must contain at least ${MIN_RUNNER_SECRET_LENGTH} characters.`,
    };
  }
  return { valid: true, code: null, message: null, secret };
}

export function requireRunnerSecret(value) {
  const status = runnerSecretStatus(value);
  if (status.valid) return status.secret;
  throw Object.assign(new Error(status.message), { code: status.code });
}

export function isRunnerRequestAuthorized(configuredSecret, providedSecret) {
  let expected;
  try { expected = Buffer.from(requireRunnerSecret(configuredSecret)); }
  catch { return false; }
  const supplied = Buffer.from(String(providedSecret || ''));
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}
