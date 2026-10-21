// The key list is an array of provider rows. Anything else is an answer the
// screen cannot read, on the try-it board or on a real censaiOS.
import { logToApp } from '../../lib/appLog/browserLog.js';

export const KEY_LIST_UNREADABLE = 'AI keys: the answer could not be read';

export function readKeyList(data) {
  const rows = Array.isArray(data) ? data : null;
  if (rows && rows.every((item) => item && typeof item === 'object')) return rows;
  logToApp('warn', KEY_LIST_UNREADABLE, { where: 'vault' });
  return [];
}
