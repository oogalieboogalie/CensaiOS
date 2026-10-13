import { withLineEndings } from '../server/workspaces/edit.js';

describe('withLineEndings', () => {
  test.each([
    ['Unix newlines to Windows', 'line1\nline2\n', '\r\n', 'line1\r\nline2\r\n'],
    ['Windows newlines to Unix', 'line1\r\nline2\r\n', '\n', 'line1\nline2\n'],
    ['old Mac newlines to Unix', 'line1\rline2\r', '\n', 'line1\nline2\n'],
    ['mixed newlines to Unix', 'line1\nline2\r\nline3\r', '\n', 'line1\nline2\nline3\n'],
  ])('converts %s', (_label, input, eol, expected) => {
    expect(withLineEndings(input, eol)).toBe(expected);
  });

  test.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['text without newlines', 'hello world'],
  ])('handles %s', (_label, input) => {
    expect(withLineEndings(input, '\n')).toBe(input ?? '');
  });
});
