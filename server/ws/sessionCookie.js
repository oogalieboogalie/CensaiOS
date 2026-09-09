import crypto from 'crypto';

function signature(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64').replace(/=+$/, '');
}

export function decodeSessionCookie(value, secret) {
  const raw = String(value || '');
  const key = String(secret || '').trim();
  if (!key) return raw || null;
  if (!raw.startsWith('s:')) return null;
  const signed = raw.slice(2);
  const splitAt = signed.lastIndexOf('.');
  if (splitAt < 1) return null;
  const sid = signed.slice(0, splitAt);
  const supplied = Buffer.from(signed.slice(splitAt + 1));
  const expected = Buffer.from(signature(sid, key));
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  return sid;
}
