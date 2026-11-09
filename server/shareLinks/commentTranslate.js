// Translate one board comment between English and French and store it on
// the comment, so the other person sees it through the same live update
// as a new reply. The caller's own model key does the work.

import { publicTranslation, translationPair } from '../../shared/comments/translationPairs.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { commentVisibleToLink } from './access.js';
import { CommentError, broadcastComment } from './comments.js';
import { getComment, setCommentTranslation } from './commentRows.js';
import { readProjectedBoard } from './projector.js';

const log = createLogger('comment-translate');
const MAX_TEXT = 2000;
const FRENCH_MARK = /[àâäçéèêëîïôùûüÿœæ]/i;
const FRENCH_WORDS = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'et', 'est', 'pas', 'que', 'qui', 'dans', 'pour', 'avec', 'bonjour', 'merci', 'vous', 'nous', 'cette', 'aux', 'sur', 'elle', 'mais', 'tout', 'très']);
const ENGLISH_WORDS = new Set(['the', 'you', 'and', 'is', 'at', 'see', 'for', 'with', 'this', 'that', 'we', 'they', 'your', 'are', 'was', 'have', 'from', 'not', 'but', 'hello']);
const inflight = new Map();
const KEY_CODES = new Set([
  'MODEL_KEY_MISSING',
  'MODEL_KEY_REJECTED',
  'MODEL_ACCESS_PERSONAL_KEY_REQUIRED',
]);

export function translationMessages(text, pair) {
  return [
    {
      role: 'system',
      content: `You translate one board comment from ${pair.fromLabel} to ${pair.toLabel}. Reply with only the translation. Keep names, @mentions and numbers as they are. No quotes, labels or notes.`,
    },
    { role: 'user', content: String(text) },
  ];
}

/** Model text with a fence, wrapping quotes or a "French:" label taken off. */
export function cleanTranslation(raw) {
  let text = String(raw || '').trim();
  const fence = /^```[\w-]*\n?([\s\S]*?)\n?```$/.exec(text);
  if (fence) text = fence[1].trim();
  const wrapped = (text.startsWith('"') && text.endsWith('"'))
    || (text.startsWith('«') && text.endsWith('»'))
    || (text.startsWith("'") && text.endsWith("'"));
  if (wrapped && text.length > 1) text = text.slice(1, -1).trim();
  text = text.replace(/^(?:translation|french|english|français|anglais)\s*:\s*/i, '').trim();
  if (!text) throw new CommentError('The model sent back an empty translation. Try again.', 422, 'TRANSLATION_EMPTY');
  return text.slice(0, MAX_TEXT);
}

function asTranslationError(error) {
  if (error instanceof CommentError) return error;
  if (KEY_CODES.has(error?.code)) {
    return new CommentError(error.message, error.statusCode || 400, error.code);
  }
  log.warn('translation failed', { code: safeErrorCode(error) });
  return new CommentError(
    'Translation did not work. Add an AI key in Settings → Vault (or set the provider key for this server), then try again.',
    422,
    'TRANSLATION_FAILED',
  );
}

async function rootFor(db, workspaceId, row, link) {
  const root = row.thread_id ? await getComment(db, { workspaceId, commentId: row.thread_id }) : row;
  if (!root) throw new CommentError('That thread no longer exists.', 404, 'COMMENT_THREAD_MISSING');
  const scoped = link && ((link.scope_kind || 'board') !== 'board' || link.stage);
  if (!scoped) return root;
  const board = await readProjectedBoard(workspaceId, link);
  const ids = new Set((board?.wins || []).map((win) => String(win.id)));
  if (!commentVisibleToLink(root, link, ids)) {
    throw new CommentError('That comment is not on what this link shares.', 404, 'COMMENT_MISSING');
  }
  return root;
}

/**
 * English or French when the comment itself shows it, otherwise null.
 * A button click is not evidence: the wrong direction must not become the label.
 */
export function detectCommentLanguage(text) {
  const value = String(text || '');
  const words = value.toLowerCase().match(/[a-zàâäçéèêëîïôùûüÿœæ]+/g) || [];
  // One accent is a hint, not a verdict: "café" in an English sentence stays English.
  let french = FRENCH_MARK.test(value) ? 1 : 0;
  let english = 0;
  for (const word of words) {
    if (FRENCH_WORDS.has(word)) french += 1;
    if (ENGLISH_WORDS.has(word)) english += 1;
  }
  if (french >= 2 && french > english) return 'fr';
  if (english >= 2 && english > french) return 'en';
  return null;
}

/** Most a reply can cost: this comment plus a translation the same maximum length. */
export function translationHold(body) {
  const chars = Math.min(String(body || '').length, MAX_TEXT);
  return Math.max(1, Math.ceil((chars + MAX_TEXT) / 4));
}

export function translationCost(body, text) {
  const chars = Math.min(String(body || '').length, MAX_TEXT) + Math.min(String(text || '').length, MAX_TEXT);
  return Math.max(1, Math.ceil(chars / 4));
}

/** Both directions already stored on the comment, keyed by pair id. */
function readCache(value) {
  let row = value;
  if (typeof value === 'string') {
    try { row = JSON.parse(value); } catch { return {}; }
  }
  const cache = {};
  const shown = publicTranslation(row);
  if (shown) cache[shown.pair] = shown.text;
  const extra = row && typeof row === 'object' ? row.cache : null;
  if (extra && typeof extra === 'object') {
    for (const id of Object.keys(extra)) {
      if (!translationPair(id) || cache[id]) continue;
      const text = typeof extra[id] === 'string' ? extra[id].trim().slice(0, MAX_TEXT) : '';
      if (text) cache[id] = text;
    }
  }
  return cache;
}

/**
 * Translate one comment and broadcast it. `complete(messages)` returns the
 * model's text. `link` is set for a guest so a scoped link cannot translate
 * a comment it cannot see. The opposite direction reuses the original only
 * when the comment's own language matches the direction already translated.
 * `holdBudget(tokens)` claims that many tokens before the model call, and
 * `releaseBudget(tokens)` gives unused or failed claims back.
 */
export function translateBoardComment(db, args) {
  // A guest must not join a member's job, or another link's. Same person, same comment: one call.
  const who = args.link ? `link:${args.link.id}` : 'member';
  const key = `${who}:${args.workspaceId}:${args.commentId}:${String(args.pair)}`;
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = translateOneComment(db, args).finally(() => {
    if (inflight.get(key) === job) inflight.delete(key);
  });
  inflight.set(key, job);
  return job;
}

async function translateOneComment(db, { workspaceId, commentId, pair, link = null, complete, holdBudget = null, releaseBudget = null }) {
  const chosen = translationPair(pair);
  if (!chosen) throw new CommentError('Pick English → French or French → English.', 400, 'TRANSLATION_PAIR');
  const requested = String(pair);
  const row = await getComment(db, { workspaceId, commentId });
  if (!row) throw new CommentError('That comment no longer exists.', 404, 'COMMENT_MISSING');
  const root = await rootFor(db, workspaceId, row, link);
  const shown = publicTranslation(row.translation);
  if (shown?.pair === requested) return row;
  const cache = readCache(row.translation);
  const other = requested === 'en-fr' ? 'fr-en' : 'en-fr';
  const otherFrom = translationPair(other)?.from;
  const source = detectCommentLanguage(row.body);
  const opposite = cache[other] && source && source === otherFrom
    ? String(row.body || '').trim().slice(0, MAX_TEXT)
    : '';
  const reused = cache[requested] || opposite;
  let text = reused;
  if (!text) {
    if (String(row.body || '').length > MAX_TEXT) {
      throw new CommentError('This comment is too long to translate.', 400, 'TRANSLATION_TOO_LONG');
    }
    let held = 0;
    try {
      if (holdBudget) {
        const want = translationHold(row.body);
        if (!await holdBudget(want)) {
          throw new CommentError(
            'This share link has no translation budget left. The board owner can raise it in Share.',
            403,
            'GUEST_TRANSLATE_BUDGET',
          );
        }
        held = want;
      }
      const raw = await complete(translationMessages(row.body, chosen));
      text = cleanTranslation(raw);
      if (held && releaseBudget && held > translationCost(row.body, text)) {
        await releaseBudget(held - translationCost(row.body, text)).catch((error) => {
          log.warn('translation budget release failed', { code: safeErrorCode(error) });
        });
      }
    } catch (error) {
      if (held && releaseBudget) {
        await releaseBudget(held).catch((releaseError) => {
          log.warn('translation budget release failed', { code: safeErrorCode(releaseError) });
        });
      }
      throw asTranslationError(error);
    }
  }
  const saved = await setCommentTranslation(db, {
    workspaceId, commentId, translation: { pair: requested, text, cache: { ...cache, [requested]: text } },
  });
  if (!saved) throw new CommentError('That comment no longer exists.', 404, 'COMMENT_MISSING');
  await broadcastComment(workspaceId, saved, root);
  if (!reused) log.info('comment translated', { workspaceId, pair: requested, chars: text.length });
  return saved;
}
