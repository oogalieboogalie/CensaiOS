import fs from 'node:fs';
import path from 'node:path';
import { onLogRecord } from '../server/logger.js';
import { chatLog, noteFailure } from '../server/routes/chat/chatLog.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

test('a failed chat side step logs a fixed line with the agent id and a short code, never the error text', () => {
  const records = [];
  const stop = onLogRecord((record) => records.push(record));
  try {
    const err = Object.assign(new Error('Made-up secret prompt for Pat at pat@example.com'), { code: 'ECONNRESET' });
    noteFailure('trace not finalized', { agentId: 'atlas' })(err);
    noteFailure('dropped conversation log', { agentId: 'atlas', side: 'user' })(new Error('relation "x" violates Made-up detail'));
    chatLog.error('chat request failed', { agentId: 'atlas', code: null });
  } finally {
    stop();
  }
  expect(records.map((r) => [r.namespace, r.level, r.message])).toEqual([
    ['chat', 'warn', 'trace not finalized'],
    ['chat', 'warn', 'dropped conversation log'],
    ['chat', 'error', 'chat request failed'],
  ]);
  expect(records[0].meta).toEqual({ agentId: 'atlas', code: 'ECONNRESET' });
  expect(records[1].meta).toEqual({ agentId: 'atlas', side: 'user', code: null });
  expect(JSON.stringify(records)).not.toMatch(/Made-up|example\.com|violates/);
});

test('the chat route and its tool loop write no raw console lines', () => {
  for (const file of ['server/routes/chat/main.js', 'server/routes/chat/chatExecution.js']) {
    expect(fs.readFileSync(path.join(ROOT, file), 'utf8')).not.toMatch(/console\.(log|error|warn|info)\(/);
  }
});
