// Everything censaiOS knows about the `tailcat` program lives in this file.
//
// Tailcat (github.com/tailscale/tailcat) connects two computers directly and
// encrypted, from anywhere, with no account. censaiOS uses three things:
//
//   tailcat genkey --client --key=<file>
//       makes this computer's identity. Prints its public half
//       ("nodekey:<64 hex>"); the secret half stays in <file>.
//   tailcat serve --json --key=new --allow=nodekey:<friend> 80:<port>
//       shares one local port with one friend, under a fresh address that
//       dies with the process. Prints {"listenAddr":"tc…"} on its output.
//       Anyone whose key is not the allowed one is silently ignored.
//   tailcat forward --key=<file> <address> 0:80
//       opens a port on this computer that leads to a friend's shared port.
//       Prints "# forwarding 127.0.0.1:<port> -> remote …" on its error
//       output once the port is listening.
//
// Tailcat promises no stable command line yet, so if a new version changes
// one of these, this file is the only place to fix.

import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { createLogger } from '../logger.js';
import { isJestRun } from '../security/testShortcut.js';
import { isTailcatAddress, plainKey } from './codes.js';

const log = createLogger('friends');
const START_TIMEOUT_MS = 25 * 1000;
const NAME = process.platform === 'win32' ? 'tailcat.exe' : 'tailcat';

function usualPlaces(env = process.env) {
  const home = env.USERPROFILE || env.HOME || '';
  if (process.platform === 'win32') {
    return [
      path.join(home, 'scoop', 'shims', NAME),
      path.join(env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', NAME),
      path.join(env.ProgramFiles || 'C:\\Program Files', 'tailcat', NAME),
    ];
  }
  return ['/usr/local/bin/tailcat', '/opt/homebrew/bin/tailcat', '/usr/bin/tailcat', '/snap/bin/tailcat', path.join(home, 'go', 'bin', 'tailcat')];
}

let program = null; // { command, args } once found
let fixed = null; // tests hand in a stand-in program

/** Tests run a stand-in: `setTailcatProgram([process.execPath, '/path/standin.mjs'])`. `null` undoes it. */
export function setTailcatProgram(commandLine) {
  fixed = Array.isArray(commandLine) && commandLine.length ? { command: commandLine[0], args: commandLine.slice(1) } : null;
  program = null;
}

function onPath(env = process.env) {
  const folders = String(env.PATH || env.Path || '').split(path.delimiter).filter(Boolean);
  return folders.map((folder) => path.join(folder, NAME));
}

/** Where the tailcat program is on this computer, or null. */
export function findTailcat({ env = process.env, fresh = false } = {}) {
  if (fixed) return fixed;
  if (program && !fresh) return program;
  // A test run never starts a real tailcat that happens to be installed.
  if (isJestRun()) return null;
  const candidates = [env.CENSAI_TAILCAT_BIN, ...onPath(env), ...usualPlaces(env)].filter(Boolean);
  for (const file of candidates) {
    try {
      if (fs.statSync(file).isFile()) {
        program = { command: file, args: [] };
        return program;
      }
    } catch {
      // not here
    }
  }
  program = null;
  return null;
}

export class TailcatError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.statusCode = code === 'NOT_INSTALLED' ? 409 : 502;
  }
}

function need() {
  const found = findTailcat();
  if (!found) throw new TailcatError('Tailcat is not on this computer yet.', 'NOT_INSTALLED');
  return found;
}

/**
 * Makes this computer's identity key file and returns its public half.
 * The file is written by tailcat itself, readable by this user only.
 */
export function makeIdentity(file) {
  const { command, args } = need();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  return new Promise((resolve, reject) => {
    execFile(command, [...args, 'genkey', '--client', '--force', `--key=${file}`], { timeout: START_TIMEOUT_MS, windowsHide: true, env: process.env }, (error, stdout) => {
      const key = plainKey(String(stdout || '').trim().split(/\s+/).pop());
      if (error || !key) return reject(new TailcatError('Tailcat could not make an identity for this censaiOS.', 'NO_IDENTITY'));
      return resolve(key);
    });
  });
}

/**
 * Starts a tailcat process and waits for the one line that says it is ready.
 * @param {string[]} args
 * @param {(text: string, stream: 'out'|'err') => any} read  returns the answer once it sees it
 */
function start(args, read, what) {
  const found = need();
  const child = spawn(found.command, [...found.args, ...args], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: process.env });
  let done = false;
  const stop = () => {
    if (child.exitCode === null && !child.killed) child.kill();
  };
  const ready = new Promise((resolve, reject) => {
    const fail = (code) => {
      if (done) return;
      done = true;
      stop();
      reject(new TailcatError(`Tailcat could not ${what}.`, code));
    };
    const timer = setTimeout(() => fail('TIMED_OUT'), START_TIMEOUT_MS);
    timer.unref?.();
    const feed = (stream) => {
      let text = '';
      return (chunk) => {
        if (done) return;
        text = (text + chunk).slice(-8192);
        const answer = read(text, stream);
        if (answer === undefined || answer === null) return;
        done = true;
        clearTimeout(timer);
        resolve(answer);
      };
    };
    child.stdout.setEncoding('utf8').on('data', feed('out'));
    child.stderr.setEncoding('utf8').on('data', feed('err'));
    child.once('error', () => { clearTimeout(timer); fail('COULD_NOT_START'); });
    child.once('exit', () => { clearTimeout(timer); fail('STOPPED_EARLY'); });
  });
  return { child, ready, stop };
}

/**
 * Shares one local port with one friend. The address is new every time and
 * stops working the moment this process is stopped.
 * @returns {{ child, stop: () => void, address: Promise<string> }}
 */
export function shareWithFriend({ friendKey, port }) {
  const key = plainKey(friendKey);
  if (!key || !Number.isInteger(port)) throw new TailcatError('Tailcat could not start sharing.', 'BAD_REQUEST');
  const run = start(['serve', '--json', '--key=new', `--allow=nodekey:${key}`, `80:${port}`], (text, stream) => {
    if (stream !== 'out') return undefined;
    for (const line of text.split('\n')) {
      try {
        const address = JSON.parse(line)?.listenAddr;
        if (isTailcatAddress(address)) return address;
      } catch {
        // not the line yet
      }
    }
    return undefined;
  }, 'start sharing');
  run.child.once('exit', (code) => log.info('friends: a sharing tunnel stopped', { code: code ?? null }));
  return { child: run.child, stop: run.stop, address: run.ready };
}

/**
 * Opens a port on this computer that leads to a friend's shared board.
 * @returns {{ child, stop: () => void, port: Promise<number> }}
 */
export function reachFriend({ address, identityFile }) {
  if (!isTailcatAddress(address)) throw new TailcatError('Tailcat could not reach that address.', 'BAD_REQUEST');
  const args = ['forward', `--key=${identityFile}`, address, '0:80'];
  const run = start(args, (text, stream) => {
    if (stream !== 'err') return undefined;
    const match = /# forwarding (?:127\.0\.0\.1|\[::1\]|localhost):(\d{2,5}) ->/.exec(text);
    return match ? Number(match[1]) : undefined;
  }, 'reach your friend');
  return { child: run.child, stop: run.stop, port: run.ready };
}

/** How to get tailcat, by system, for the card that says it is missing. */
export function installHint(platform = process.platform) {
  if (platform === 'win32') return { how: 'In PowerShell', line: 'scoop install tailcat' };
  if (platform === 'darwin') return { how: 'In Terminal', line: 'brew install tailcat' };
  return { how: 'In a terminal', line: 'sudo snap install tailcat' };
}
