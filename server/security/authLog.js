// Sign-in problems go to the app log as a fixed reason plus a short error
// code. The error object itself is never logged: its message can repeat an
// email, a username or a database detail.
import { createLogger } from '../logger.js';
import { safeErrorCode } from './errorCode.js';

const log = createLogger('auth');

export const authErrorCode = safeErrorCode;

export function logAuthProblem(reason, err, level = 'error') {
  log[level](reason, { code: authErrorCode(err) });
}
