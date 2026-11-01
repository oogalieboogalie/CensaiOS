// The 'tools' log: one line when an agent tool's side step fails. A fixed
// message, the agent or task id and a short error code, never the error's
// text (it can repeat a path, a query or a key).

import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';

export const toolsLog = createLogger('tools');

export function noteToolFailure(message, ids, err) {
  toolsLog.warn(message, { ...ids, code: safeErrorCode(err) });
}
