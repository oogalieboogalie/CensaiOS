import net from 'node:net';

// A word for what kind of address something pointed at, for log lines that
// must not carry the address itself (a detail of the owner's network).
export function addressKind(address) {
  let ip = String(address || '').replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) ip = mapped[1];
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 127) return 'loopback';
    if (a === 169 && b === 254) return 'link-local';
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private';
    if (a === 100 && b >= 64 && b <= 127) return 'shared';
    if (a >= 224) return 'multicast';
    return 'reserved';
  }
  if (net.isIPv6(ip)) {
    if (ip === '::1') return 'loopback';
    if (/^fe[89ab]/.test(ip)) return 'link-local';
    if (/^f[cd]/.test(ip)) return 'private';
    if (ip.startsWith('ff')) return 'multicast';
    return 'reserved';
  }
  return 'unknown';
}
