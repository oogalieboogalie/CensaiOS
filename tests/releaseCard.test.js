// The release automation's changelog writer and the release card the public
// CI reads on every push to main and nightly (scripts/release/).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import { NIGHTLY_TAG, releaseCard } from '../scripts/release/card.mjs';
import { parseChangelog, readSection, UNRELEASED_HEADING, withRelease, withUnreleased } from '../scripts/release/changelog.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const cardScript = path.join(testDir, '..', 'scripts', 'release', 'card.mjs');
const ciWorkflow = path.join(testDir, '..', '.github', 'workflows', 'ci.yml');

const CHANGELOG = [
  '# Changelog',
  '',
  'Every release, newest first.',
  '',
  '## 0.3.0 (2026-10-15)',
  '',
  'Brought up to date by hand.',
  '',
  '## 0.2.0 — 2026-06-10',
  '',
  '- First release.',
  '',
].join('\n');

const REPO = 'example-org/ExampleOS';
const SHA = 'abcdef1234567890abcdef1234567890abcdef12';

describe('release changelog', () => {
  test('reads the intro and each release section', () => {
    const parsed = parseChangelog(CHANGELOG);
    expect(parsed.intro).toBe('# Changelog\n\nEvery release, newest first.');
    expect(parsed.sections.map((s) => s.version)).toEqual(['0.3.0', '0.2.0']);
    expect(readSection(CHANGELOG, '0.2.0')).toBe('- First release.');
    expect(readSection(CHANGELOG, '0.9.0')).toBeNull();
    expect(readSection(CHANGELOG, 'unreleased')).toBeNull();
  });

  test('the nightly list sits on top and is replaced each night, never stacked', () => {
    const once = withUnreleased(CHANGELOG, '### New\n\n- Sticky notes snap to the grid');
    const twice = withUnreleased(once, '### New\n\n- Sticky notes snap to the grid\n- A dark clock face');
    expect(twice.split(UNRELEASED_HEADING)).toHaveLength(2);
    expect(parseChangelog(twice).sections[0].unreleased).toBe(true);
    expect(readSection(twice, 'unreleased')).toBe('### New\n\n- Sticky notes snap to the grid\n- A dark clock face');
    expect(readSection(twice, '0.3.0')).toBe('Brought up to date by hand.');
    expect(withUnreleased(twice, null)).toBe(withUnreleased(CHANGELOG, null));
  });

  test('a stable release takes the nightly list\'s place, once', () => {
    const nightly = withUnreleased(CHANGELOG, '- Sticky notes snap to the grid');
    const released = withRelease(nightly, '0.4.0', '2026-10-25', '### New\n\n- Sticky notes snap to the grid');
    expect(released).not.toContain(UNRELEASED_HEADING);
    expect(parseChangelog(released).sections.map((s) => s.heading)).toEqual([
      '## 0.4.0 (2026-10-25)',
      '## 0.3.0 (2026-10-15)',
      '## 0.2.0 — 2026-06-10',
    ]);
    expect(readSection(released, '0.4.0')).toBe('### New\n\n- Sticky notes snap to the grid');
    expect(withRelease(released, '0.4.0', '2026-10-25', 'Again').match(/^## 0\.4\.0/gm)).toHaveLength(1);
  });

  test('Windows line endings read the same', () => {
    expect(parseChangelog(CHANGELOG.replace(/\n/g, '\r\n'))).toEqual(parseChangelog(CHANGELOG));
  });
});

describe('release card', () => {
  const nightlyChangelog = withUnreleased(CHANGELOG, '### New\n\n- Sticky notes snap to the grid');
  const stableChangelog = withRelease(nightlyChangelog, '0.4.0', '2026-10-25', '### New\n\n- Sticky notes snap to the grid');

  test('a nightly push moves the one nightly pre-release', () => {
    const card = releaseCard({
      branch: 'nightly', repo: REPO, sha: SHA, changelog: nightlyChangelog,
      release: { channel: 'nightly', version: '0.4.0-nightly.20261019.2', date: '2026-10-19' },
    });
    expect(card).toMatchObject({ channel: 'nightly', tag: NIGHTLY_TAG, prerelease: true, version: '0.4.0-nightly.20261019.2' });
    expect(card.images).toEqual([
      'ghcr.io/example-org/exampleos:nightly',
      'ghcr.io/example-org/exampleos:0.4.0-nightly.20261019.2',
      'ghcr.io/example-org/exampleos:sha-abcdef123456',
    ]);
    expect(card.title).toBe('Nightly build 0.4.0-nightly.20261019.2 (not tested by a person)');
    expect(card.notes).toContain('- Sticky notes snap to the grid');
    expect(card.notes).toContain(`https://github.com/${REPO}/releases/latest`);
  });

  test('a stable push publishes v<version> with that version\'s notes', () => {
    const card = releaseCard({
      branch: 'main', repo: REPO, sha: SHA, changelog: stableChangelog,
      release: { channel: 'stable', version: '0.4.0', date: '2026-10-25' },
    });
    expect(card).toMatchObject({ channel: 'stable', tag: 'v0.4.0', title: 'censaiOS 0.4.0', prerelease: false });
    expect(card.images).toEqual([
      'ghcr.io/example-org/exampleos:0.4.0',
      'ghcr.io/example-org/exampleos:stable',
      'ghcr.io/example-org/exampleos:latest',
      'ghcr.io/example-org/exampleos:sha-abcdef123456',
    ]);
    expect(card.notes).toContain('- Sticky notes snap to the grid');
    expect(card.notes).not.toContain('Brought up to date by hand.');
  });

  test('anything else publishes nothing', () => {
    const nightly = { channel: 'nightly', version: '0.4.0-nightly.20261019', date: '2026-10-19' };
    const stable = { channel: 'stable', version: '0.4.0', date: '2026-10-25' };
    for (const [branch, release] of [
      ['main', nightly], // a nightly build is never a stable release
      ['nightly', stable],
      ['feature', nightly],
      ['main', null], // no release.json
      ['main', { channel: 'stable', version: '0.4' }],
      ['nightly', { channel: 'nightly', version: '0.4.0-nightly.2026101' }],
    ]) {
      expect(releaseCard({ branch, repo: REPO, sha: SHA, changelog: CHANGELOG, release })).toEqual({ channel: 'none' });
    }
  });

  test('the command prints GitHub outputs and writes the notes file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-card-'));
    try {
      fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), nightlyChangelog);
      fs.writeFileSync(path.join(dir, 'release.json'), JSON.stringify({ channel: 'nightly', version: '0.4.0-nightly.20261019', date: '2026-10-19' }));
      const notes = path.join(dir, 'notes.md');
      const run = spawnSync(process.execPath, [cardScript, '--branch', 'nightly', '--repo', REPO, '--sha', SHA, '--notes', notes], { cwd: dir, encoding: 'utf8' });
      expect(run.status).toBe(0);
      expect(run.stdout.trim().split('\n')).toEqual([
        'channel=nightly',
        'version=0.4.0-nightly.20261019',
        `tag=${NIGHTLY_TAG}`,
        'title=Nightly build 0.4.0-nightly.20261019 (not tested by a person)',
        'prerelease=true',
        'images=ghcr.io/example-org/exampleos:nightly ghcr.io/example-org/exampleos:0.4.0-nightly.20261019 ghcr.io/example-org/exampleos:sha-abcdef123456',
      ]);
      expect(run.stderr).toContain('release: this push to nightly publishes nightly 0.4.0-nightly.20261019');
      expect(fs.readFileSync(notes, 'utf8')).toContain('- Sticky notes snap to the grid');

      fs.rmSync(path.join(dir, 'release.json'));
      const none = spawnSync(process.execPath, [cardScript, '--branch', 'main', '--repo', REPO, '--sha', SHA, '--notes', notes], { cwd: dir, encoding: 'utf8' });
      expect(none.status).toBe(0);
      expect(none.stdout.trim()).toBe('channel=none');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the public CI release job', () => {
  const steps = yaml.load(fs.readFileSync(ciWorkflow, 'utf8')).jobs.release.steps;
  const go = steps.find((step) => step.id === 'go');

  test('builds and publishes only after checking the push still publishes', () => {
    const publishing = steps.filter((step) => /docker push|gh release create/.test(step.run || ''));
    expect(publishing).toHaveLength(2);
    for (const step of publishing) {
      expect({ step: step.name, if: step.if }).toEqual({ step: step.name, if: "steps.go.outputs.publish == 'true'" });
      expect(steps.indexOf(step)).toBeGreaterThan(steps.indexOf(go));
    }
  });

  // The job runs on GitHub's Linux machines, so its shell is tested where bash runs it.
  (process.platform === 'win32' ? test.skip : test)('only the newest commit on the branch publishes, and a stable release never changes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-go-'));
    const newer = '1234567890abcdef1234567890abcdef12345678';
    let runs = 0;
    try {
      // Stand-ins for git and gh: the branch's tip on GitHub, and whether the release exists.
      fs.writeFileSync(path.join(dir, 'git'), '#!/bin/sh\n[ "$1" = ls-remote ] && printf \'%s\\t%s\\n\' "$TIP" "$3"\n', { mode: 0o755 });
      fs.writeFileSync(path.join(dir, 'gh'), '#!/bin/sh\n[ "$1 $2" = "release view" ] && [ "$EXISTS" = yes ]\n', { mode: 0o755 });
      const check = ({ channel, tip = SHA, exists = 'no' }) => {
        runs += 1;
        const output = path.join(dir, `output-${runs}`);
        const run = spawnSync('bash', ['-c', go.run], {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${dir}${path.delimiter}${process.env.PATH}`,
            GITHUB_OUTPUT: output,
            GITHUB_REF_NAME: channel === 'stable' ? 'main' : 'nightly',
            GITHUB_SHA: SHA,
            CHANNEL: channel,
            TAG: channel === 'stable' ? 'v0.4.0' : NIGHTLY_TAG,
            TIP: tip,
            EXISTS: exists,
          },
        });
        expect(run.status).toBe(0);
        return { publish: fs.readFileSync(output, 'utf8').trim(), said: run.stdout.trim() };
      };

      expect(check({ channel: 'nightly' })).toEqual({ publish: 'publish=true', said: '' });
      expect(check({ channel: 'nightly', tip: newer }))
        .toEqual({ publish: 'publish=false', said: 'release: nightly has moved on to 1234567890ab, which publishes instead' });
      expect(check({ channel: 'stable' })).toEqual({ publish: 'publish=true', said: '' });
      expect(check({ channel: 'stable', exists: 'yes' }))
        .toEqual({ publish: 'publish=false', said: 'release: v0.4.0 already exists; a stable release never changes' });
      expect(check({ channel: 'stable', tip: newer }).publish).toBe('publish=false');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
