/**
 * src/lib/tools/toolMeaning.js
 *
 * Search by meaning (diagram 10): words that mean the same job, so
 * "send a message" also finds mail, Slack and agent messages, and "reboot"
 * finds restart. Offline and keyless on purpose (BYOK): a word list, not a
 * model. Add a word to the group it belongs to; a word may sit in several.
 */

export const MEANING_GROUPS = Object.freeze([
  ['message', 'send', 'email', 'mail', 'mailbox', 'inbox', 'slack', 'chat', 'notify', 'tell', 'reply', 'broadcast', 'post', 'dm'],
  ['file', 'document', 'doc', 'save', 'write', 'edit', 'read', 'open', 'folder', 'dir', 'path'],
  ['restart', 'reboot', 'reset', 'bounce', 'reload', 'service'],
  ['container', 'docker', 'service', 'server', 'host', 'logs', 'deploy'],
  ['status', 'health', 'check', 'monitor', 'running', 'alive', 'uptime'],
  ['search', 'find', 'look', 'lookup', 'research', 'web', 'browse', 'online', 'internet', 'discover'],
  ['remember', 'memory', 'recall', 'note', 'fact', 'journal', 'knowledge', 'know'],
  ['git', 'commit', 'branch', 'repo', 'github', 'pr', 'pull', 'push', 'merge', 'checkout'],
  ['database', 'db', 'sql', 'postgres', 'table', 'query', 'schema'],
  ['run', 'execute', 'shell', 'command', 'terminal', 'bash', 'exec', 'sandbox'],
  ['test', 'tests', 'lint', 'linter', 'verify', 'check'],
  ['video', 'movie', 'clip', 'film', 'media'],
  ['spreadsheet', 'sheet', 'sheets', 'excel', 'row', 'cell'],
  ['agent', 'agents', 'delegate', 'assign', 'helper', 'subagent', 'squad', 'team', 'task'],
  ['calendar', 'schedule', 'event', 'meeting', 'appointment'],
  ['delete', 'remove', 'drop', 'erase', 'clear'],
  ['create', 'add', 'make', 'new', 'build', 'generate'],
  ['client', 'lead', 'customer', 'deal', 'contact'],
  ['window', 'canvas', 'board', 'screen'],
]);

const STOPWORDS = new Set(['a', 'an', 'the', 'to', 'of', 'for', 'and', 'or', 'my', 'me', 'i', 'it', 'in', 'on', 'at', 'with', 'this', 'that', 'some', 'please', 'can', 'you', 'how', 'do', 'something', 'thing', 'up', 'some']);

/** Trim common endings so "messages", "restarting", "sent" meet their root. */
export function stem(word) {
  const w = String(word || '').toLowerCase();
  if (w === 'sent') return 'send';
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('es') && !w.endsWith('ses')) return w.slice(0, -1);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** Plain query words, stop words dropped, endings trimmed. */
export function queryWords(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word && !STOPWORDS.has(word))
    .map(stem);
}

const GROUPS_BY_WORD = (() => {
  const map = new Map();
  for (const group of MEANING_GROUPS) {
    for (const word of group) {
      const key = stem(word);
      if (!map.has(key)) map.set(key, new Set());
      for (const other of group) map.get(key).add(stem(other));
    }
  }
  return map;
})();

/** Words that mean the same job as `word` (not including the word itself). */
export function relatedWords(word) {
  const key = stem(word);
  return [...(GROUPS_BY_WORD.get(key) || [])].filter((other) => other !== key);
}
