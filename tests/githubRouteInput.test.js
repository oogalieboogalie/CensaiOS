import {
  parseIssueState,
  parsePositiveInteger,
  parsePullState,
  parseRepository,
} from '../server/routes/github/client.js';

describe('GitHub route input boundaries', () => {
  test('accepts canonical owner/name repositories', () => {
    expect(parseRepository('oogalieboogalie/censai')).toEqual({ owner: 'oogalieboogalie', repo: 'censai' });
  });

  test.each([
    'https://evil.example/x',
    'owner/repo/extra',
    'owner/../repo',
    'owner/repo?x=y',
    'owner//repo',
  ])('rejects repository input that could alter the API target: %s', (value) => {
    expect(() => parseRepository(value)).toThrow(/owner\/name/i);
  });

  test('requires positive integer issue and pull numbers', () => {
    expect(parsePositiveInteger('42')).toBe(42);
    expect(() => parsePositiveInteger('../42')).toThrow(/positive integer/i);
    expect(() => parsePositiveInteger(0)).toThrow(/positive integer/i);
  });

  test('allowlists issue and pull states', () => {
    expect(parseIssueState('all')).toBe('all');
    expect(parsePullState('closed')).toBe('closed');
    expect(() => parseIssueState('all&per_page=999')).toThrow(/state/i);
    expect(() => parsePullState('draft')).toThrow(/state/i);
  });
});
