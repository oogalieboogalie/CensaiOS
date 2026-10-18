/**
 * Self-fix: the secret-stripping part of scrub.js, with no Node imports, so the
 * board can use the same rules on an error snippet before it is shown or sent
 * to an agent (src/lib/errorReport.js).
 */

const PATTERNS = [
  // Provider keys and tokens (Anthropic, OpenAI, GitHub, Slack, Google, Tavily, Stripe…)
  [/\bsk-(?:ant-)?[A-Za-z0-9_-]{12,}/g, '[key]'],
  [/\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{12,}/g, '[key]'],
  [/\bxox[abprs]-[A-Za-z0-9-]{8,}/g, '[key]'],
  [/\bAIza[0-9A-Za-z_-]{20,}/g, '[key]'],
  [/\btvly-[A-Za-z0-9_-]{8,}/g, '[key]'],
  [/\b(?:rk|pk|sk)_(?:live|test)_[A-Za-z0-9]{8,}/g, '[key]'],
  // JWTs and bearer/basic auth
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, '[token]'],
  [/\b(Bearer|Basic|token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [token]'],
  // key=value / "key": "value" for anything named like a secret
  [/((?:api[_-]?key|secret|token|password|passwd|cookie|session|authorization)["']?\s*[:=]\s*["']?)[^\s"',;}&]+/gi, '$1[redacted]'],
  // credentials inside URLs, and query strings that carry them
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi, '$1[user]:[redacted]@'],
  // emails
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  // long hex / base64 runs (hashes, keys, encoded blobs)
  [/\b[A-Fa-f0-9]{32,}\b/g, '[hex]'],
  [/\b(?=[A-Za-z0-9+_-]*\d)(?=[A-Za-z0-9+_-]*[A-Za-z])[A-Za-z0-9+_-]{40,}={0,2}/g, '[blob]'],
];

const HOME_DIRS = /(\/(?:home|Users)\/|[A-Za-z]:\\Users\\)[^/\\\s]+/g;

export function scrubText(value, max = 2000) {
  let text = String(value ?? '');
  for (const [pattern, replacement] of PATTERNS) text = text.replace(pattern, replacement);
  // Keep paths readable but drop the person's account name from them.
  text = text.replace(HOME_DIRS, '$1[user]');
  return text.length > max ? `${text.slice(0, max)}… [cut]` : text;
}

/** A stack trace: scrubbed, at most `frames` frames, no source lines quoted. */
export function scrubStack(stack, frames = 14) {
  if (!stack) return '';
  const lines = String(stack).split('\n');
  const head = lines[0];
  const body = lines.slice(1).filter((l) => /^\s*at\s|@/.test(l)).slice(0, frames);
  return scrubText([head, ...body].join('\n'), 4000);
}

