import { formatReadChunk } from '../../../server/workspaces/read.js';

describe('formatReadChunk', () => {
  const content = 'abcdefghijklmnopqrstuvwxyz';

  test('returns the content directly when the requested window covers the file', () => {
    expect(formatReadChunk(content, 'test.txt', { maxChars: 100 })).toBe(content);
  });

  test('describes the next offset for a partial chunk', () => {
    expect(formatReadChunk(content, 'test.txt', { maxChars: 5 })).toBe(
      '[partial read: test.txt]\nchars 0-5 of 26\nnext chunk: call again with offset 5\nabcde'
    );
  });

  test('reads from an offset through the end of the file', () => {
    expect(formatReadChunk(content, 'test.txt', { offset: 20, maxChars: 10 })).toBe(
      '[partial read: test.txt]\nchars 20-26 of 26\nend of file\nuvwxyz'
    );
  });

  test('clamps offsets beyond the end of the file', () => {
    expect(formatReadChunk(content, 'test.txt', { offset: 50, maxChars: 10 })).toBe(
      '[partial read: test.txt]\nchars 26-26 of 26\nend of file\n'
    );
  });
});
