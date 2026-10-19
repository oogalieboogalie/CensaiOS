#!/usr/bin/env node
// What the public CI publishes for one push, read from release.json and
// CHANGELOG.md (both written by the release automation).
//
//   node scripts/release/card.mjs --branch nightly --repo owner/name --sha <commit> --notes <file>
//
// Prints GitHub Actions outputs, one key=value per line:
//   channel     nightly | stable | none (nothing to publish for this push)
//   version     0.4.0-nightly.20261019 or 0.4.0
//   tag         nightly-build (moves to each new nightly) or v0.4.0 (never moves)
//   title       the release title
//   prerelease  true for nightly builds
//   images      the container tags to build and push, space-separated
// and writes the release notes (Markdown) to --notes.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readSection } from './changelog.mjs';

const STABLE = /^\d+\.\d+\.\d+$/;
const NIGHTLY = /^\d+\.\d+\.\d+-nightly\.\d{8}(\.\d+)?$/;
export const NIGHTLY_TAG = 'nightly-build';

function nightlyNotes({ repo, version, date, changes }) {
  return [
    '**This is a nightly build.** It is made automatically every night from the newest work that',
    'passed its automatic checks, and nobody has tested it by hand yet. If you rely on censaiOS, use',
    `the [latest stable release](https://github.com/${repo}/releases/latest) instead.`,
    '',
    `Version \`${version}\`, built ${date}.`,
    '',
    changes || 'No listed changes since the last stable release.',
    '',
    '**Try it:** in your CensaiOS folder run `git fetch origin nightly`, `git checkout nightly` and',
    '`docker compose up -d --build`, or use the `nightly` container image.',
    '**Go back to stable:** `git checkout main` and `docker compose up -d --build`.',
  ].join('\n');
}

function stableNotes({ repo, version, changes }) {
  return [
    `censaiOS ${version} is the stable release for this week: the newest nightly build that passed`,
    'every automatic check, given a version number. See the',
    `[changelog](https://github.com/${repo}/blob/main/CHANGELOG.md) for every release.`,
    '',
    changes || 'No listed changes.',
    '',
    '**Update:** in your CensaiOS folder run `git pull` and `docker compose up -d --build`, or use the',
    `\`${version}\` container image (also tagged \`latest\` and \`stable\`).`,
  ].join('\n');
}

/** Decides what a push to `branch` publishes. Pure: no files, no network. */
export function releaseCard({ branch, repo, sha, release, changelog }) {
  const image = `ghcr.io/${String(repo).toLowerCase()}`;
  const short = String(sha).slice(0, 12);
  const version = String(release?.version || '');
  if (branch === 'nightly' && release?.channel === 'nightly' && NIGHTLY.test(version)) {
    return {
      channel: 'nightly',
      version,
      tag: NIGHTLY_TAG,
      title: `Nightly build ${version} (not tested by a person)`,
      prerelease: true,
      images: [`${image}:nightly`, `${image}:${version}`, `${image}:sha-${short}`],
      notes: nightlyNotes({ repo, version, date: release.date, changes: readSection(changelog, 'unreleased') }),
    };
  }
  if (branch === 'main' && release?.channel === 'stable' && STABLE.test(version)) {
    return {
      channel: 'stable',
      version,
      tag: `v${version}`,
      title: `censaiOS ${version}`,
      prerelease: false,
      images: [`${image}:${version}`, `${image}:stable`, `${image}:latest`, `${image}:sha-${short}`],
      notes: stableNotes({ repo, version, changes: readSection(changelog, version) }),
    };
  }
  return { channel: 'none' };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function main(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1];
  const changelog = fs.existsSync('CHANGELOG.md') ? fs.readFileSync('CHANGELOG.md', 'utf8') : '';
  const card = releaseCard({ ...args, release: readJson('release.json'), changelog });
  // stdout goes to $GITHUB_OUTPUT, so the plain log line goes to stderr.
  console.error(card.channel === 'none'
    ? `release: this push to ${args.branch} publishes nothing`
    : `release: this push to ${args.branch} publishes ${card.channel} ${card.version}`);
  if (card.channel !== 'none') fs.writeFileSync(args.notes, `${card.notes}\n`);
  console.log(`channel=${card.channel}`);
  if (card.channel === 'none') return;
  for (const key of ['version', 'tag', 'title', 'prerelease']) console.log(`${key}=${card[key]}`);
  console.log(`images=${card.images.join(' ')}`);
}

// Started as a command (symlinks resolved on both sides), not imported by a test.
function startedAsCommand() {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (startedAsCommand()) main(process.argv.slice(2));
