import { jest } from '@jest/globals';
import { resolveHostShell } from '../server/terminal/backends.js';

describe('terminal host shell selection', () => {
  test('keeps the configured executable when it exists', () => {
    const exists = jest.fn(candidate => candidate === '/custom/bash');
    expect(resolveHostShell({ platform: 'linux', env: { SHELL: '/custom/bash' }, exists }))
      .toBe('/custom/bash');
  });

  test('falls back to Alpine-compatible sh when bash is absent', () => {
    const exists = jest.fn(candidate => candidate === '/bin/sh');
    expect(resolveHostShell({ platform: 'linux', env: {}, exists })).toBe('/bin/sh');
    expect(exists).toHaveBeenCalledWith('/bin/bash');
    expect(exists).toHaveBeenCalledWith('/bin/sh');
  });

  test('preserves the Windows shell contract', () => {
    expect(resolveHostShell({ platform: 'win32', env: { ComSpec: 'cmd.exe' } })).toBe('cmd.exe');
  });
});
