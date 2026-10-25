// A short, safe error code for a log line or an answer: the error's own code,
// an HTTP-style status or a provider error word, and only when it looks like
// a code. The error's message is never used: it can repeat an email, a key,
// a prompt or a database detail.
const SAFE_CODE = /^[A-Za-z0-9_.-]{1,40}$/;

export function safeErrorCode(err) {
  const candidates = [err?.code, err?.response?.data?.error, err?.status, err?.statusCode];
  for (const value of candidates) {
    if (value != null && SAFE_CODE.test(String(value))) return String(value);
  }
  return null;
}
