import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const kit = path.join(process.cwd(), 'starter-box');
const run = (file, args = []) => execFileSync('bash', [path.join(kit, file), ...args], { encoding: 'utf8' });

describe('starter box kit', () => {
  test('both scripts are valid bash', () => {
    for (const file of ['setup.sh', 'starter-box']) {
      execFileSync('bash', ['-n', path.join(kit, file)]);
    }
  });

  test('setup lists every step it runs, ending with the check', () => {
    const steps = run('setup.sh', ['--list']).trim().split('\n');
    expect(steps).toEqual(expect.arrayContaining(['docker', 'ai_tools', 'censaios', 'firewall', 'welcome']));
    expect(steps.at(-1)).toBe('doctor');
    const source = fs.readFileSync(path.join(kit, 'setup.sh'), 'utf8');
    for (const step of steps) expect(source).toContain(`step_${step}() {`);
  });

  test('the welcome names the one address to open', () => {
    const out = run('starter-box', ['welcome']);
    expect(out).toContain('http://localhost:3002');
    expect(out).toContain('never in between your computer and the router');
  });

  test('setup starts services without systemd (MX Linux) and downloads the ready-made censaiOS', () => {
    const source = fs.readFileSync(path.join(kit, 'setup.sh'), 'utf8');
    expect(source).toContain('INIT=sysv');
    expect(source).toContain('update-rc.d "$s" defaults');
    expect(source).toContain('*:*debian*');
    expect(source).toContain('ghcr.io/oogalieboogalie/censaios:$tag');
    expect(source).toContain('CENSAI_APP_MEMORY=2g');
    const guide = fs.readFileSync(path.join(process.cwd(), 'docs', 'install-linux.md'), 'utf8');
    expect(guide).toContain('sudo bash ~/censaios-kit/starter-box/setup.sh');
  });

  test('the keys template sets no key by itself', () => {
    const lines = fs.readFileSync(path.join(kit, 'keys.env.example'), 'utf8').split('\n');
    expect(lines.filter((l) => l.trim() && !l.startsWith('#'))).toEqual([]);
  });
});
