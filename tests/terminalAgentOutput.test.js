import { filterAgentChunk, flushAgentCarry, agentTailText, stripAnsi } from '../server/terminal/agentOutput.js';

const ESC = String.fromCharCode(27);

function promoBlock() {
  return (
    '\n\n' + ESC + '[1mWhat' + String.fromCharCode(39) + 's next:' + ESC + '[0m\n' +
    '    Try Docker Debug for seamless debugging\n' +
    '    Learn more at https://docs.docker.com/go/debug-cli/\n'
  );
}

describe('agent output hygiene', () => {
  test('strips the docker promo block, keeps real output', () => {
    const out = filterAgentChunk({}, 'hello' + promoBlock() + 'done');
    expect(out).toContain('hello');
    expect(out).toContain('done');
    expect(out).not.toContain('What');
    expect(out).not.toContain('debug-cli');
  });

  test('survives a promo split across chunks without leaking escapes', () => {
    const full = 'hello' + promoBlock() + 'done';
    const cut = full.indexOf('Docker');
    const session = {};
    const part1 = filterAgentChunk(session, full.slice(0, cut));
    const part2 = filterAgentChunk(session, full.slice(cut));
    const flushed = flushAgentCarry(session);
    const combined = part1 + part2 + flushed;
    expect(combined).toContain('hello');
    expect(combined.endsWith('done')).toBe(true);
    expect(combined).not.toContain('What');
    expect(combined).not.toContain('debug-cli');
    expect(combined).not.toContain('Docker');
  });

  test('plain output passes through untouched', () => {
    expect(filterAgentChunk({}, 'just text\n')).toBe('just text\n');
  });

  test('toast tails are plain text', () => {
    expect(agentTailText(ESC + '[1mok' + ESC + '[0m line')).toBe('ok line');
    expect(stripAnsi('a' + ESC + '[32mb')).toBe('ab');
  });
});
