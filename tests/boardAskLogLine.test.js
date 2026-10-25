import { onLogRecord } from '../server/logger.js';
import { logBoardAsk } from '../server/agent-registry/boardAgentAsk.js';

function capture(fn) {
  const lines = [];
  const stop = onLogRecord((record) => {
    if (record.namespace === 'board-help') lines.push({ level: record.level, message: record.message, meta: record.meta });
  });
  try { fn(); } finally { stop(); }
  return lines;
}

describe('the board-help log line', () => {
  test('names agents by id, never by a typed title', () => {
    const lines = capture(() => logBoardAsk({ from: 'lead-1', to: 'Pat\'s secret plan <b>' }, { status: 'failed', why: 'not on this board' }));
    expect(lines).toEqual([{
      level: 'info', message: 'board ask',
      meta: { from: 'lead-1', to: 'unknown', outcome: 'not answered', why: 'not on this board' },
    }]);
    expect(JSON.stringify(lines)).not.toMatch(/Pat|secret/);
  });

  test('an answered ask carries no why', () => {
    const lines = capture(() => logBoardAsk({ from: 'lead-1', to: 'researcher-1' }, { status: 'completed' }));
    expect(lines[0].meta).toEqual({ from: 'lead-1', to: 'researcher-1', outcome: 'answered' });
  });

  test('a missing asker logs the word unknown', () => {
    const lines = capture(() => logBoardAsk({ to: 'researcher-1' }, { status: 'failed', why: 'cannot ask itself' }));
    expect(lines[0].meta.from).toBe('unknown');
  });
});
