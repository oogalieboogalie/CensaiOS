#!/usr/bin/env node
// Security tripwires - fast, zero-dependency checks for the contribution gate.
//
// Catches the cheap-but-nasty patterns that deep analyzers (CodeQL) and secret
// scanners (gitleaks) are not aimed at: Trojan-Source unicode tricks, npm
// lifecycle-hook injection, dynamic code execution, browser-side process
// spawning, hardcoded raw-IP endpoints, smuggled encoded blobs, piped-shell
// installers, and dangerous CI triggers. Scans every git-tracked text file.
//
// Usage: node scripts/security-tripwires.mjs   (exit 1 on any violation)

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { isBinaryFile } from './security-tripwire-files.mjs';

const SELF = 'scripts/security-tripwires.mjs'; // contains the patterns it hunts
const CODE_EXT = /\.(jsx?|mjs|cjs|tsx?|json|ya?ml|html|css|sql|sh|ps1|bat)$/i;
const TEST_PATH = /(^|\/)tests?\/|\.test\.|\.spec\.|(^|\/)setupTests/;
const LIFECYCLE_KEYS = ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepack', 'postpack'];

// Trojan Source (CVE-2021-42574): bidi controls reorder what reviewers see.
const BIDI_RE = /[\u202A-\u202E\u2066-\u2069\u061C]/;
// Zero-width / invisible characters that can spoof identifiers and strings.
const INVISIBLE_RE = /[\u200B-\u200D\u2060\uFEFF]/g;

// Known-good exceptions, listed as "<file>:<rule>". Add sparingly, with a PR
// explaining why the hit is safe.
const ALLOW = new Set([
  // This lifecycle hook only points Git at the repository's tracked hooks.
  // It does not download, build, or execute third-party install payloads.
  'package.json:lifecycle-hook',
]);

const trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const files = trackedFiles.filter((file) => fs.existsSync(file));
const violations = [];
const flag = (file, line, rule, detail) => {
  if (!ALLOW.has(`${file}:${rule}`)) violations.push({ file, line, rule, detail });
};

const isPrivateIp = (url) =>
  /\/\/(127\.|10\.|0\.0\.0\.0|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|255\.)/.test(url);

for (const file of files) {
  if (file === SELF || isBinaryFile(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const isCode = CODE_EXT.test(file);
  const isAppCode = /^(src|server|scripts)\//.test(file) && /\.(jsx?|mjs|cjs|tsx?)$/.test(file) && !TEST_PATH.test(file);
  const isWorkflow = file.startsWith('.github/workflows/');

  // npm lifecycle hooks run arbitrary code on every `npm install` - the
  // classic supply-chain implant. This repo uses none; any addition is hostile
  // until proven otherwise.
  if (/(^|\/)package\.json$/.test(file)) {
    const scripts = JSON.parse(text).scripts || {};
    for (const key of LIFECYCLE_KEYS) {
      if (scripts[key]) flag(file, 0, 'lifecycle-hook', `npm "${key}" script installs are not allowed: ${scripts[key]}`);
    }
  }

  text.split('\n').forEach((ln, i) => {
    const n = i + 1;

    if (BIDI_RE.test(ln)) {
      flag(file, n, 'bidi-control', 'unicode bidirectional control character');
    }

    if (isCode) {
      // ZWJ/ZWNJ between non-ASCII neighbors are legitimate emoji sequences -
      // skip those; everything else invisible is treated as hostile.
      for (const m of ln.matchAll(INVISIBLE_RE)) {
        if (m[0] === '\uFEFF' && n === 1 && m.index === 0) continue; // leading BOM
        const zwjLike = m[0] === '\u200C' || m[0] === '\u200D';
        const prev = m.index > 0 ? ln.charCodeAt(m.index - 1) : 65;
        const next = m.index < ln.length - 1 ? ln.charCodeAt(m.index + 1) : 65;
        if (!zwjLike || (prev < 128 && next < 128)) {
          flag(file, n, 'invisible-char', `invisible unicode U+${m[0].codePointAt(0).toString(16).toUpperCase()}`);
        }
      }

      // Encoded payloads big enough to hide a binary or script stage.
      if (!file.startsWith('public/') && /[A-Za-z0-9+/]{4000,}={0,2}/.test(ln)) {
        flag(file, n, 'encoded-blob', 'base64-like blob over 4000 chars');
      }

      // Hardcoded public raw-IP endpoints bypass DNS-level review.
      for (const m of ln.matchAll(/(?:https?|wss?|ftp):\/\/(?:\d{1,3}\.){3}\d{1,3}/g)) {
        if (!isPrivateIp(m[0])) flag(file, n, 'raw-ip-url', m[0]);
      }

      // Download-and-execute one-liners.
      if (/\b(curl|wget)\b[^|\n]*\|\s*(ba|z|da)?sh\b/.test(ln)) {
        flag(file, n, 'piped-shell', 'piping a download into a shell');
      }
    }

    if (isAppCode) {
      // Dynamic code execution defeats all static review.
      if (/\beval\s*\(|new\s+Function\s*\(/.test(ln)) {
        flag(file, n, 'dynamic-code', 'eval()/new Function()');
      }
      // Browser-bundle code must never reach for process spawning.
      if (file.startsWith('src/') && /child_process/.test(ln)) {
        flag(file, n, 'browser-spawn', 'child_process referenced in client code');
      }

      // Compliance/PII leakage: common patterns that should not be in AI prompts or source code.
      // 1. Credit Card (Luhn-like patterns)
      if (/\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})\b/.test(ln)) {
        flag(file, n, 'compliance-pii', 'potential credit card number detected');
      }
      // 2. SSN (approximate)
      if (/\b\d{3}-\d{2}-\d{4}\b/.test(ln)) {
        flag(file, n, 'compliance-pii', 'potential Social Security Number detected');
      }
    }

    // pull_request_target with checkout of PR code = secrets exfiltration.
    // Test the non-comment portion so a cautionary mention in a YAML comment
    // (e.g. "# never use pull_request_target") is not itself flagged.
    if (isWorkflow && /pull_request_target/.test(ln.split('#')[0])) {
      flag(file, n, 'pwn-request', 'pull_request_target trigger is banned');
    }
  });
}

if (violations.length) {
  console.error(`x security tripwires: ${violations.length} violation(s)\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]  ${v.detail}`);
  }
  console.error('\nIf a hit is a verified false positive, add "<file>:<rule>" to ALLOW in');
  console.error(`${SELF} in a dedicated commit that explains why it is safe.`);
  process.exit(1);
}
console.log(`ok - security tripwires clean (${files.length} files scanned)`);
