#!/usr/bin/env node
// Gatekeeper's key tool. The private key is written only outside this repo.
//   node scripts/merge-bot/sign-clear.mjs keygen --private /path/outside/gatekeeper.pem
//   node scripts/merge-bot/sign-clear.mjs sign --repo owner/Homebase --pr 12 --sha <40 hex> --key /path/outside/gatekeeper.pem
//   node scripts/merge-bot/sign-clear.mjs revoke --repo owner/Homebase --pr 12 --sha <40 hex> --key /path/outside/gatekeeper.pem
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import { clearMessage, revokeMessage } from '../../server/mergeBot/signature.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [cmd, ...args] = process.argv.slice(2);

function flag(name) {
  const index = args.indexOf(name);
  return index >= 0 ? String(args[index + 1] || '') : '';
}

function insideRepo(target) {
  const abs = path.resolve(target);
  return abs === root || abs.startsWith(`${root}${path.sep}`);
}

if (cmd === 'keygen') {
  const dest = flag('--private');
  if (!dest || insideRepo(dest)) {
    process.stderr.write('Pass --private with a path outside this repo. The private key is never written here.\n');
    process.exit(1);
  }
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  fs.writeFileSync(path.resolve(dest), privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  process.stdout.write(publicKey.export({ type: 'spki', format: 'pem' }));
  process.exit(0);
}

if (cmd === 'sign' || cmd === 'revoke') {
  const repo = flag('--repo').trim();
  const pr = flag('--pr').trim();
  const sha = flag('--sha').trim().toLowerCase();
  const keyPath = flag('--key');
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo) || !/^\d+$/.test(pr) || !/^[0-9a-f]{40}$/.test(sha) || !keyPath) {
    process.stderr.write('Need --repo owner/name --pr <number> --sha <40 hex> --key <private key file>.\n');
    process.exit(1);
  }
  if (insideRepo(keyPath)) {
    process.stderr.write('Refusing a private key that sits inside this repo.\n');
    process.exit(1);
  }
  const key = createPrivateKey(fs.readFileSync(path.resolve(keyPath)));
  const message = cmd === 'revoke' ? revokeMessage(repo, pr, sha) : clearMessage(repo, pr, sha);
  const sig = sign(null, Buffer.from(message), key).toString('base64');
  const verb = cmd === 'revoke' ? 'gatekeeper-revoke' : 'gatekeeper-clear';
  process.stdout.write(`${verb}: ${sha} pr=${pr} sig=${sig}\n`);
  process.exit(0);
}

process.stderr.write('Use keygen, sign, or revoke.\n');
process.exit(1);
