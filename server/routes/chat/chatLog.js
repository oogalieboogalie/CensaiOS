// Chat's own failure notes for the app log: a fixed message, the agent id and
// a short error code, never the error's text (it can repeat a prompt, a key or
// a database detail).

import { createLogger } from '../../logger.js';
import { safeErrorCode } from '../../security/errorCode.js';

export const chatLog = createLogger('chat');

/** A .catch handler noting that a side step (a trace, a conversation log) failed. */
export function noteFailure(message, fields = {}) {
  return (err) => chatLog.warn(message, { ...fields, code: safeErrorCode(err) });
}
