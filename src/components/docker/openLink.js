import { logToApp } from '../../lib/appLog/browserLog.js';

// Where a container's "Open" link should point. A published port lives on the
// computer that runs Docker, which is the computer serving censaiOS, so the
// link uses the same host name as the page. Only when the page itself is on
// this PC (localhost, 127.0.0.1, ::1, *.localhost) does it say localhost.

const THIS_PC = /^(localhost|127(?:\.\d{1,3}){3}|\[?::1\]?|.+\.localhost)$/i;

/** The host port from a published binding such as 0.0.0.0:8080 or [::]:8080. */
export function publishedPort(binding) {
  const port = String(binding || '').split(':').pop();
  return /^\d{1,5}$/.test(port) && Number(port) > 0 && Number(port) < 65536 ? port : '';
}

export function isThisPc(hostname) {
  return THIS_PC.test(String(hostname || ''));
}

/** The address to open, or '' when the binding has no usable port. */
export function openLinkFor(binding, location = typeof window !== 'undefined' ? window.location : null) {
  const port = publishedPort(binding);
  if (!port) return '';
  const hostname = location?.hostname || 'localhost';
  if (isThisPc(hostname)) return `http://localhost:${port}`;
  const host = hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname;
  return `http://${host}:${port}`;
}

/** One app log line per Open: the port, and this PC or another address. */
export function logOpen(binding, location = typeof window !== 'undefined' ? window.location : null) {
  const port = publishedPort(binding);
  const where = isThisPc(location?.hostname || 'localhost') ? 'this PC' : 'another address';
  logToApp('info', `docker: opened port ${port || 'unknown'} on ${where}`, { where: 'docker' });
}
