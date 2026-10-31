import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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
  describe('Ollama stays on this box until the firewall is on', () => {
    const source = fs.readFileSync(path.join(kit, 'setup.sh'), 'utf8');
    const fn = (name) => {
      const m = source.match(new RegExp(`^${name}\\(\\) \\{[\\s\\S]*?^\\}$`, 'm'));
      if (!m) throw new Error(`no ${name} in setup.sh`);
      return m[0];
    };
    const names = ['firewall_active', 'ollama_open_to_docker', 'ollama_keep_private', 'step_ollama', 'step_firewall'];

    // Runs the real step functions with stand-in ufw and systemctl. ufwState is
    // what `ufw status` says; enableFails makes `ufw --force enable` fail.
    const runSteps = (steps, { ufwState = 'inactive', enableFails = false, dropinExists = false } = {}) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'starter-box-'));
      const dropin = path.join(dir, 'ollama.service.d', 'starter-box.conf');
      if (dropinExists) {
        fs.mkdirSync(path.dirname(dropin), { recursive: true });
        fs.writeFileSync(dropin, '[Service]\nEnvironment="OLLAMA_HOST=0.0.0.0:11434"\n');
      }
      const script = [
        'set -Eeuo pipefail',
        `INIT=systemd; OLLAMA_DROPIN=${JSON.stringify(dropin)}; STATE=${JSON.stringify(ufwState)}`,
        'say() { :; }; note() { :; }; warn() { :; }; die() { exit 1; }; apt_install() { :; }; curl() { return 1; }',
        'have() { return 0; }; wanted() { return 0; }; systemctl() { :; }',
        `ufw() { if [ "$1" = status ]; then echo "Status: $STATE"; elif [ "$1" = --force ]; then ${enableFails ? 'return 1' : 'STATE=active'}; fi; }`,
        ...names.map(fn),
        ...steps.map((s) => `step_${s}`),
      ].join('\n');
      let failed = false;
      try {
        execFileSync('bash', ['-c', script], { encoding: 'utf8', stdio: 'pipe' });
      } catch {
        failed = true;
      }
      const open = fs.existsSync(dropin) && fs.readFileSync(dropin, 'utf8').includes('OLLAMA_HOST=0.0.0.0');
      fs.rmSync(dir, { recursive: true, force: true });
      return { failed, open };
    };

    test('the Ollama step alone never opens Ollama to the network', () => {
      expect(runSteps(['ollama'])).toEqual({ failed: false, open: false });
      expect(fn('step_ollama')).not.toContain('0.0.0.0');
    });

    test('a later step failing before the firewall leaves Ollama private', () => {
      // setup stops at the first failure, so the firewall step never runs
      expect(runSteps(['ollama']).open).toBe(false);
    });

    test('Ollama opens to Docker only after the firewall turns on', () => {
      expect(runSteps(['ollama', 'firewall'])).toEqual({ failed: false, open: true });
    });

    test('if turning the firewall on fails, Ollama stays private', () => {
      expect(runSteps(['ollama', 'firewall'], { enableFails: true })).toEqual({ failed: true, open: false });
    });

    test('running setup again with the firewall off closes an earlier opening', () => {
      expect(runSteps(['ollama'], { dropinExists: true }).open).toBe(false);
    });

    test('running setup again with the firewall already on keeps Ollama reachable', () => {
      expect(runSteps(['ollama'], { ufwState: 'active', dropinExists: true }).open).toBe(true);
    });
  });
});
