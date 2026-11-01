// A file read that failed must stay out of the editor buffer. Save writes that
// buffer, so an error string in it would replace the file on disk.
import { logToApp } from '../../lib/appLog/browserLog.js';
import { FILE_PROBLEMS, fileProblemWords } from '../../../shared/files/fileProblems.js';

/**
 * Why the file would not open, in plain words: the server's reason when it
 * sent a known one, else what the answer's status means. Never the server's
 * own text.
 */
export function fileLoadMessage(status, reason) {
  const words = fileProblemWords(reason);
  if (words) return words;
  if (status === 404) return FILE_PROBLEMS.missing;
  if (status === 403) return 'You may not open this file here.';
  if (status === 401) return 'Sign in again to open this file.';
  if (!status) return 'censaiOS did not answer. It may be restarting, so try again in a moment.';
  return FILE_PROBLEMS.unreadable;
}

export function initialFileLoad(filePath) {
  const path = filePath || '';
  return { path, status: path ? 'loading' : 'idle', message: '' };
}

/** Kind, status and a known reason only. The file's text and the server's error string stay out. */
export function warnFileLoadFailed(kind, status, reason) {
  const why = fileProblemWords(reason) ? `, ${reason}` : '';
  logToApp('warn', `${kind}: file failed to load (status ${status}${why})`, { where: kind });
}

export async function readFileLoad(res) {
  const status = Number(res?.status) || 0;
  try {
    const data = await res.json();
    if (data?.error || res?.ok === false) {
      const reason = fileProblemWords(data?.reason) ? data.reason : '';
      return { ok: false, status, reason, message: fileLoadMessage(status, reason) };
    }
    return { ok: true, status, content: typeof data?.content === 'string' ? data.content : '' };
  } catch {
    return { ok: false, status, reason: '', message: fileLoadMessage(status) };
  }
}
