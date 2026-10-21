// A try-it request this board does not answer. The log names the feature and
// nothing else: no query, no id, no typed text.
import { logToApp } from '../appLog/browserLog.js';

function isId(part) {
  return part.length > 24 || /^[0-9a-f-]{8,}$/i.test(part);
}

/** One path word. A query, an id, or an address is not a feature. */
export function demoFeature(pathname) {
  const parts = String(pathname || '').split('?')[0].split('/').filter(Boolean);
  if (parts[0] === 'api') parts.shift();
  while (parts.length > 1 && isId(parts[parts.length - 1])) parts.pop();
  const feature = parts[parts.length - 1] || 'request';
  if (feature.includes('@') || /[\s%]/.test(feature)) return 'request';
  return feature;
}

/** Log a call the try-it board has no real answer for. Windows still get an empty answer. */
export function declineFeature(pathname) {
  logToApp('warn', `try-it board turned down ${demoFeature(pathname)}`, { where: 'try-it' });
}
