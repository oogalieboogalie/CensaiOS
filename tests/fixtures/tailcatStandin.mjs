#!/usr/bin/env node
// A stand-in for the `tailcat` program, for tests and proof runs on one
// machine. It speaks the three commands censaiOS uses, in the same words
// (server/friends/tailcat.js), and keeps tailcat's one promise that matters
// here: a shared port answers only the one key it was shared with.
//
//   genkey --client [--force] --key=<file>      -> prints nodekey:<64 hex>
//   serve --json --key=new --allow=nodekey:<hex> 80:<port>
//                                               -> prints {"listenAddr":"tc…"}
//   forward --key=<file> <address> 0:80
//                                               -> prints "# forwarding 127.0.0.1:<port> -> remote 80"
//
// Where the real tailcat finds the other side across the internet, this one
// looks in a folder both sides share (TAILCAT_STANDIN_DIR). It encrypts
// nothing and proves nothing about real tailcat.

import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((arg) => arg.startsWith('--')).map((arg) => {
  const [name, ...rest] = arg.slice(2).split('=');
  return [name, rest.length ? rest.join('=') : true];
}));
const [command, ...rest] = args.filter((arg) => !arg.startsWith('--'));
const shared = process.env.TAILCAT_STANDIN_DIR;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

if (!shared) fail('tailcat stand-in: TAILCAT_STANDIN_DIR is not set');
fs.mkdirSync(shared, { recursive: true });
const entry = (address) => path.join(shared, `${address}.json`);

if (command === 'genkey') {
  if (!flags.client || typeof flags.key !== 'string') fail('usage: genkey --client --key=<file>');
  if (fs.existsSync(flags.key) && !flags.force) fail(`${flags.key} already exists; use --force to overwrite`);
  const publicKey = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(flags.key), { recursive: true });
  fs.writeFileSync(flags.key, JSON.stringify({ standIn: true, public: publicKey }), { mode: 0o600 });
  // Written in one go: leaving right after an ordinary write can cut it off.
  fs.writeSync(2, `# wrote file to ${flags.key}\n`);
  fs.writeSync(1, `nodekey:${publicKey}\n`);
  process.exit(0);
}

if (command === 'serve') {
  const mapping = /^80:(\d+)$/.exec(rest[0] || '');
  if (!mapping || flags.key !== 'new' || typeof flags.allow !== 'string') fail('usage: serve --json --key=new --allow=nodekey:<hex> 80:<port>');
  const allow = flags.allow.split(',').map((key) => key.replace(/^nodekey:/, ''));
  const address = `tc${crypto.randomBytes(30).toString('base64url')}`;
  fs.writeFileSync(entry(address), JSON.stringify({ allow, port: Number(mapping[1]) }));
  const tidy = () => { try { fs.unlinkSync(entry(address)); } catch { /* gone */ } };
  process.on('exit', tidy);
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => process.exit(0));
  process.stderr.write(`# 🐈 Server listening with new address: ${address}\n`);
  if (flags.json) process.stdout.write(`${JSON.stringify({ listenAddr: address })}\n`);
  setInterval(() => {}, 60_000);
} else if (command === 'forward') {
  const [address, mapping] = rest;
  if (!address || mapping !== '0:80' || typeof flags.key !== 'string') fail('usage: forward --key=<file> <address> 0:80');
  let me = '';
  try { me = JSON.parse(fs.readFileSync(flags.key, 'utf8')).public; } catch { fail(`cannot read key ${flags.key}`); }
  const server = net.createServer((socket) => {
    let target;
    try { target = JSON.parse(fs.readFileSync(entry(address), 'utf8')); } catch { target = null; }
    socket.on('error', () => {});
    // The real tailcat ignores a key that is not allowed: no answer at all.
    if (!target || !target.allow.includes(me)) {
      setTimeout(() => socket.destroy(), 60_000).unref();
      return;
    }
    const upstream = net.connect(target.port, '127.0.0.1');
    upstream.on('error', () => socket.destroy());
    socket.pipe(upstream).pipe(socket);
  });
  server.listen(0, '127.0.0.1', () => {
    process.stderr.write(`# forwarding 127.0.0.1:${server.address().port} -> remote 80\n`);
  });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => process.exit(0));
  // A test can have the tunnel die by itself: TAILCAT_STANDIN_FORWARD_LIFE_MS.
  const life = Number(process.env.TAILCAT_STANDIN_FORWARD_LIFE_MS);
  if (life > 0) setTimeout(() => process.exit(0), life);
} else {
  fail(`tailcat stand-in: unknown command ${command || '(none)'}`);
}
