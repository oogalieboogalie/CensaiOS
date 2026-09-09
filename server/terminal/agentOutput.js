/**
 * Output hygiene for headless agent sessions.
 *
 * The pty runs `docker exec`, and the Docker CLI appends a "What's next:
 * Try Docker Debug…" promo to stderr on some invocations. It is noise in an
 * agent transcript (and worse, in completion toasts), so it is stripped
 * here. Chunk-split safe: a partial promo at a chunk edge is held in
 * `session.promoCarry` until the rest arrives.
 */

const ESC = '\x1b';
const ANSI_RE = new RegExp(ESC + '\\[[0-9;]*m', 'g');
const PROMO_RE = new RegExp(
  '(?:' + ESC + '\\[[0-9;]*m)?What' + String.fromCharCode(39) + 's next:' +
  '(?:' + ESC + '\\[[0-9;]*m)?[\\s\\S]*?debug-cli\\/[^\\r\\n]*(?:\\r?\\n)?'
);
const PROMO_START = "What's next:";
// Trailing escape at the hold point, complete or partial: it belongs to the
// promo opener (e.g. a bold-on code right before "What's next"), so carry it.
const TRAILING_ESC_RE = new RegExp(ESC + '\\[[0-9;]*m?$');
const MAX_CARRY = 1024;

export function stripAnsi(text) {
  return String(text || '').replace(ANSI_RE, '');
}

function stripCompletePromos(text) {
  let next = text;
  for (;;) {
    const match = PROMO_RE.exec(next);
    if (!match) break;
    const cut = next.slice(0, match.index) + next.slice(match.index + match[0].length);
    if (cut === next) break;
    next = cut;
  }
  return next;
}

/**
 * Filter one pty chunk for an agent session. Returns the text safe to
 * display/broadcast. Holds a trailing partial promo in session.promoCarry.
 */
export function filterAgentChunk(session, data) {
  const carry = String(session.promoCarry || '');
  session.promoCarry = '';
  const combined = carry + String(data || '');
  const cleaned = stripCompletePromos(combined);
  const startAt = cleaned.indexOf(PROMO_START);
  if (startAt >= 0) {
    // Possible partial promo at the tail — emit the head, hold the rest.
    // Never slice through an escape sequence: carry a trailing partial too.
    const escAt = cleaned.slice(0, startAt).search(TRAILING_ESC_RE);
    const holdFrom = escAt >= 0 ? escAt : startAt;
    session.promoCarry = cleaned.slice(holdFrom, holdFrom + MAX_CARRY);
    return cleaned.slice(0, holdFrom);
  }
  return cleaned;
}

export function flushAgentCarry(session) {
  const carry = String(session.promoCarry || '');
  session.promoCarry = '';
  return stripCompletePromos(carry);
}

/** Plain-text tail for toasts/notifications (no ANSI, no promo). */
export function agentTailText(scrollback, maxChars = 600) {
  return stripAnsi(String(scrollback || '')).slice(-maxChars);
}
