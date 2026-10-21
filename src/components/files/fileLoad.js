// A file read that failed must stay out of the editor buffer. Save writes that
// buffer, so an error string in it would replace the file on disk.
import { logToApp } from '../../lib/appLog/browserLog.js';

export function fileLoadMessage(status) {
  return `Failed to load file (status ${status}).`;
}

export function initialFileLoad(filePath) {
  const path = filePath || '';
  return { path, status: path ? 'loading' : 'idle', message: '' };
}

/** Kind and status only. The file's text and the server's error string stay out. */
export function warnFileLoadFailed(kind, status) {
  logToApp('warn', `${kind}: file failed to load (status ${status})`, { where: kind });
}

export async function readFileLoad(res) {
  const status = Number(res?.status) || 0;
  try {
    const data = await res.json();
    if (data?.error || res?.ok === false) return { ok: false, status, message: fileLoadMessage(status) };
    return { ok: true, status, content: typeof data?.content === 'string' ? data.content : '' };
  } catch {
    return { ok: false, status, message: fileLoadMessage(status) };
  }
}
