// Sign-in problems go to the app log as a fixed reason plus a short error
// code. The error object itself is never logged: its message can repeat an
// email, a username or a database detail.
import { createLogger } from '../logger.js';

const log = createLogger('auth');
const SAFE_CODE = /^[A-Za-z0-9_.-]{1,40}$/;

export function authErrorCode(err) {
  const candidates = [err?.code, err?.response?.data?.error, err?.status];
  for (const value of candidates) {
    if (value != null && SAFE_CODE.test(String(value))) return String(value);
  }
  return null;
}

export function logAuthProblem(reason, err, level = 'error') {
  log[level](reason, { code: authErrorCode(err) });
}
