// The shared-terminal catastrophic tripwire. This is the security seatbelt that
// protects against a hallucinated, unrecoverable command in full-trust auto-run.
// It must block the machine-wreckers AND must not false-positive on ordinary
// (even destructive-but-recoverable) commands, or it becomes useless friction.

import { isCatastrophic } from '../server/terminalSafety.js';

describe('terminal tripwire — BLOCKS catastrophic commands', () => {
  const blocked = [
    'rm -rf /',
    'rm -rf /*',
    'rm -rf ~',
    'rm -fr ~/',
    'sudo rm -rf --no-preserve-root /',
    'rm --recursive --force /',
    'mkfs.ext4 /dev/sda1',
    'dd if=/dev/zero of=/dev/sda bs=1M',
    ':(){ :|:& };:',
    'echo boom > /dev/sda',
    'chmod -R 000 /',
    'shutdown -h now',
    'sudo reboot',
    'git push --force origin main',
    'git push origin master --force',
  ];
  test.each(blocked)('blocks: %s', (cmd) => {
    expect(isCatastrophic(cmd)).toBeTruthy();
  });
});

describe('terminal tripwire — ALLOWS ordinary commands', () => {
  const allowed = [
    'rm -rf node_modules',
    'rm -rf ./dist',
    'rm -rf build/cache',
    'rm package-lock.json',
    'npm test',
    'npm run build',
    'git status',
    'git push origin feature/shared-terminal',
    'git push --force origin feature/my-branch',
    'ls -la /home/alex/project',
    'docker ps -a',
    'git commit -m "reboot the cache layer on shutdown"',
    'echo "shutdown is scary"',
    'node scripts/migrate.js',
  ];
  test.each(allowed)('allows: %s', (cmd) => {
    expect(isCatastrophic(cmd)).toBeNull();
  });
});

describe('terminal tripwire — returns a human reason', () => {
  test('the reason explains why', () => {
    expect(isCatastrophic('rm -rf /')).toMatch(/delete/i);
    expect(isCatastrophic('git push --force origin main')).toMatch(/force-push/i);
  });
});
