import crypto from 'crypto';

/**
 * Self-fix: strip secrets and personal data out of an error report before it
 * is saved or handed to a coding agent.
 *
 * Keys, tokens, emails, long ids and anything that looks like file contents
 * never leave here. What stays is what a developer needs: the message with
 * the secrets cut out, the stack, and the shape of what happened.
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

/** Recent actions (clicks, API calls): short labels only, never typed text. */
export function scrubActions(actions, max = 20) {
  if (!Array.isArray(actions)) return [];
  return actions.slice(-max).map((a) => ({
    at: Number(a?.at) || null,
    type: scrubText(a?.type, 24),
    label: scrubText(a?.label, 80),
    windowKind: a?.windowKind ? scrubText(a.windowKind, 40) : null,
  }));
}

/**
 * Same error, same fingerprint: the message with numbers and ids flattened,
 * plus the first few frames of the stack by file and function (not line,
 * so an unrelated edit above it does not make it look new).
 */
export function fingerprint({ kind = '', message = '', stack = '', path: apiPath = '' }) {
  const normalized = String(message)
    .replace(/^(Uncaught\s+)?(\w*Error:\s*)?/, '')
    .replace(/\[(key|token|email|hex|blob|redacted)\]/g, '')
    .replace(/\b[0-9a-f]{6,}\b/gi, '#')
    .replace(/\d+/g, '#')
    .replace(/(["'`]).*?\1/g, '$1…$1')
    .slice(0, 200);
  const frames = String(stack).split('\n').slice(1)
    .map((l) => l.replace(/:\d+(:\d+)?\)?\s*$/, '').replace(/\?[^\s)]*/, '').replace(/^\s*at\s+/, '').trim())
    .filter(Boolean)
    .slice(0, 3);
  const route = String(apiPath).replace(/\/\d+(?=\/|$)/g, '/#').replace(/\?.*$/, '');
  // A window crash also reaches the page as an uncaught error: one report, not two.
  const group = kind === 'api-failed' ? 'api' : 'error';
  return crypto.createHash('sha1').update([group, normalized, route, ...frames].join('|')).digest('hex').slice(0, 16);
}
