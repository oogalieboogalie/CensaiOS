// Tailscale gives every device on a tailnet its own address: an IPv4 one in
// 100.64.0.0/10 and an IPv6 one in fd7a:115c:a1e0::/48. A connection whose
// far end is one of these came over Tailscale, from the device that holds it.

/** '::ffff:100.101.1.2' -> '100.101.1.2'; brackets and a zone are dropped. */
export function plainAddress(value) {
  let text = String(value || '').trim().toLowerCase();
  if (text.startsWith('[')) {
    const end = text.indexOf(']');
    text = text.slice(1, end === -1 ? undefined : end);
  }
  text = text.replace(/%.*$/, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  return mapped ? mapped[1] : text;
}

export function isTailnetIpv4(value) {
  const parts = plainAddress(value).split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return false;
  const [a, b] = parts.map(Number);
  return a === 100 && b >= 64 && b <= 127;
}

export function isTailnetIpv6(value) {
  return /^fd7a:115c:a1e0:/.test(plainAddress(value));
}

export function isTailnetAddress(value) {
  return isTailnetIpv4(value) || isTailnetIpv6(value);
}

/** The name part of a Host header or URL host: 'box.example.ts.net:3004' -> 'box.example.ts.net'. */
export function hostNameOf(host) {
  const value = String(host || '').trim().toLowerCase();
  if (!value) return '';
  if (value.startsWith('[')) return plainAddress(value);
  return value.split(':')[0].replace(/\.$/, '');
}

/** An address as it is written inside http://…: IPv6 gets brackets. */
export function addressForUrl(address) {
  const plain = plainAddress(address);
  return plain.includes(':') ? `[${plain}]` : plain;
}
