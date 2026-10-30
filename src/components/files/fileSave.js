// A Save that did not save must say so. The Document and Code editor show that
// the file was not saved and why, in plain words: never the server's own text,
// which names its folders.
import { logToApp } from '../../lib/appLog/browserLog.js';
import { SAVE_PROBLEMS, saveProblemWords } from '../../../shared/files/fileProblems.js';

// Long enough for a big file over a slow link; then Save works again.
const SAVE_TIMEOUT_MS = 60_000;
const NO_ANSWER = 'censaiOS did not answer. It may be restarting, so try again in a moment.';

/**
 * Why a save did not happen, in plain words: the server's reason when it sent
 * a known one, else what the answer's status means. `unsure` when censaiOS
 * itself did not answer (nothing came back, a proxy answered, or something
 * else did), since the save may still have happened.
 */
export function saveProblem(status, reason, answered = true) {
  const words = saveProblemWords(reason);
  if (words) return { why: words, unsure: false };
  if (status === 401) return { why: 'Sign in again to save.', unsure: false };
  if (status === 403) return { why: 'You may not save this file here.', unsure: false };
  if (status === 413) return { why: SAVE_PROBLEMS.tooBig, unsure: false };
  if (!status || (status >= 502 && status <= 504) || !answered) return { why: NO_ANSWER, unsure: true };
  return { why: SAVE_PROBLEMS.unsaved, unsure: false };
}

/**
 * Writes `content` to the file at `filePath` on this computer (`create`: a new
 * file only). Answers { ok: true }, or { ok: false, status, reason, why,
 * unsure } with `why` in plain words. A failure is logged with the window's
 * kind, the status and a known reason only: never the file's path or words.
 */
export async function saveFileContent(filePath, content, kind, { create = false, timeoutMs = SAVE_TIMEOUT_MS } = {}) {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), timeoutMs);
  let status = 0;
  let reason = '';
  let answered = false;
  try {
    const res = await fetch('/api/files/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(create ? { path: filePath, content, create: true } : { path: filePath, content }),
      signal: stop.signal,
    });
    status = Number(res?.status) || 0;
    const data = await res.json().catch(() => null);
    // Saved only when censaiOS says so; a refusal is censaiOS's when it wrote one.
    if (res?.ok && data?.ok === true) return { ok: true };
    answered = !res?.ok && typeof data === 'object' && data !== null;
    if (saveProblemWords(data?.reason)) reason = data.reason;
  } catch {
    // No answer, or none in time: status 0 says so.
  } finally {
    clearTimeout(timer);
  }
  // A new file already there is an answer, not a failure (a link opens that file).
  if (reason !== 'exists') logToApp('warn', `${kind}: file not saved (status ${status}${reason ? `, ${reason}` : ''})`, { where: kind });
  return { ok: false, status, reason, ...saveProblem(status, reason, answered) };
}
