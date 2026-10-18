// Legion: reading what the models write back. Models wrap JSON in prose or
// code fences and sometimes forget the closing fence, so this is forgiving.

const MAX_FILES = 40;
const MAX_FILE_BYTES = 200_000;

/** The first JSON object in a reply, or null. */
export function parseJsonReply(text) {
  const raw = String(text || '');
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const candidates = [fenced?.[1], raw];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    try { return JSON.parse(candidate.slice(start, end + 1)); } catch { /* try the next one */ }
  }
  return null;
}

/** A project-relative path that cannot climb out of the project. */
export function safeRelativePath(input) {
  const cleaned = String(input || '').trim().replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '');
  if (!cleaned || cleaned.length > 200) return null;
  const parts = cleaned.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || part.startsWith('.git'))) return null;
  if (!/^[\w./ @+-]+$/.test(cleaned)) return null;
  return cleaned;
}

/**
 * Files from a builder's reply:
 *   === FILE: path
 *   content
 *   === END
 * Returns { files: [{ path, content }], notes, remember, skipped }.
 */
export function parseFileBlocks(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const files = [];
  const skipped = [];
  let notes = '';
  let remember = '';
  let current = null;
  const close = () => {
    if (!current) return;
    let body = current.lines.join('\n');
    // Some models fence the content inside the block.
    const fence = /^```[\w-]*\n([\s\S]*?)\n```\s*$/.exec(body.trim());
    if (fence) body = fence[1];
    if (Buffer.byteLength(body) > MAX_FILE_BYTES) skipped.push(current.path);
    else if (files.length < MAX_FILES) files.push({ path: current.path, content: body.endsWith('\n') ? body : `${body}\n` });
    current = null;
  };
  for (const line of lines) {
    const start = /^=== ?FILE:\s*(.+?)\s*=*\s*$/.exec(line);
    if (start) {
      close();
      const path = safeRelativePath(start[1]);
      if (path) current = { path, lines: [] };
      else skipped.push(start[1]);
      continue;
    }
    if (current && /^=== ?END\s*=*\s*$/.test(line)) { close(); continue; }
    if (current) { current.lines.push(line); continue; }
    const note = /^NOTES:\s*(.*)$/.exec(line.trim());
    if (note) notes = note[1].slice(0, 400);
    const keep = /^REMEMBER:\s*(.*)$/.exec(line.trim());
    if (keep) remember = keep[1].slice(0, 400);
  }
  close();
  // Last file wins when a builder writes the same path twice.
  const byPath = new Map(files.map((file) => [file.path, file]));
  return { files: [...byPath.values()], notes, remember, skipped };
}

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Echo's verdict, cleaned. Anything unreadable counts as NOK. */
export function cleanVerdict(reply, builders) {
  const json = parseJsonReply(reply) || {};
  const verdict = String(json.verdict || '').toUpperCase() === 'OK' ? 'OK' : 'NOK';
  const todo = (Array.isArray(json.todo) ? json.todo : []).slice(0, 12).map((item) => ({
    job: text(item?.job, 24),
    owner: builders.includes(String(item?.owner || '').toLowerCase()) ? String(item.owner).toLowerCase() : builders[builders.length - 1],
    problem: text(item?.problem, 400),
    file: text(item?.file, 200),
    line: Number.isFinite(Number(item?.line)) && Number(item.line) > 0 ? Number(item.line) : null,
  })).filter((item) => item.problem);
  const summary = text(json.summary, 400) || (Object.keys(json).length ? '' : 'Echo\'s answer could not be read, so it counts as NOK.');
  if (verdict === 'NOK' && !todo.length) {
    todo.push({ owner: builders[builders.length - 1], problem: summary || 'Echo did not say what is wrong.', file: '', line: null });
  }
  return { verdict, summary, todo: verdict === 'OK' ? [] : todo };
}
