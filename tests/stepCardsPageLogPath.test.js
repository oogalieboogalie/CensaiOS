import { jest } from '@jest/globals';

const lines = [];
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: () => ({ info: (msg, meta) => lines.push({ msg, meta }), warn: () => {}, error: () => {}, debug: () => {} }),
}));
const { checkPage } = await import('../server/stepCards/pageCheck.js');
const { addressKind } = await import('../server/security/addressKind.js');

test('a page check logs only the first part of the path the card author typed', async () => {
  await checkPage('', { host: 'localhost', port: '5173', path: '/customers/pat-example/notes?token=abc' }, { allowed: () => false });
  expect(lines[0].meta).toEqual({ path: '/customers', status: null, worked: false, why: 'turned off' });
  expect(JSON.stringify(lines)).not.toMatch(/pat-example|token|abc/);
});

test('addresses become a kind word', () => {
  expect(addressKind('127.0.0.1')).toBe('loopback');
  expect(addressKind('::1')).toBe('loopback');
  expect(addressKind('::ffff:192.168.1.20')).toBe('private');
  expect(addressKind('10.0.0.5')).toBe('private');
  expect(addressKind('169.254.169.254')).toBe('link-local');
  expect(addressKind('fe80::1')).toBe('link-local');
  expect(addressKind('fd00::5')).toBe('private');
  expect(addressKind('0.0.0.0')).toBe('reserved');
});
