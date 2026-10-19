#!/usr/bin/env node
/**
 * Stand-in for xAI's Grok CLI (Grok Build), for the Grok sign-in chat's
 * tests and screenshots. No model, no network: it speaks the same shapes
 * the real one documents (docs/user-guide/14-headless-mode.md and
 * 02-authentication.md in github.com/xai-org/grok-build).
 *
 *   grok --version
 *   grok login --device-auth   prints a link and a code, then saves
 *                              $GROK_HOME/auth.json after STANDIN_GROK_LOGIN_MS
 *   grok logout                removes it
 *   grok -p <prompt> --output-format streaming-json [-r <id>] ...
 *                              refuses without auth.json; otherwise streams
 *                              thought / tool_call / text / end lines
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const argv = process.argv.slice(2);
const home = process.env.GROK_HOME || path.join(os.homedir(), '.grok');
const authFile = path.join(home, 'auth.json');
const out = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const delay = Number(process.env.STANDIN_DELAY_MS || 60);

if (argv.includes('--version')) {
  process.stdout.write('grok 0.1.99 (stand-in)\n');
  process.exit(0);
}

if (argv[0] === 'login') {
  process.stderr.write('To sign in, open https://accounts.x.ai/device in a browser and enter the code WXYZ-4821\n');
  process.stderr.write('Waiting for you to approve...\n');
  await sleep(Number(process.env.STANDIN_GROK_LOGIN_MS || 1500));
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(authFile, JSON.stringify({ access_token: 'standin-token', account: process.env.STANDIN_GROK_ACCOUNT || 'standin' }));
  process.stderr.write('Signed in.\n');
  process.exit(0);
}

if (argv[0] === 'logout') {
  fs.rmSync(authFile, { force: true });
  process.exit(0);
}

const promptAt = argv.indexOf('-p');
if (promptAt < 0) {
  process.stderr.write('stand-in grok: only headless -p is supported\n');
  process.exit(2);
}
const prompt = argv[promptAt + 1] || '';
const resumeAt = argv.indexOf('-r');
const resumed = resumeAt >= 0 ? argv[resumeAt + 1] : null;
const tools = argv.includes('--tools') ? argv[argv.indexOf('--tools') + 1] : 'all';

if (!fs.existsSync(authFile) && !process.env.XAI_API_KEY) {
  out({ type: 'error', message: 'Not signed in. Run `grok login` to sign in.' });
  process.exit(1);
}

const auth = fs.existsSync(authFile) ? JSON.parse(fs.readFileSync(authFile, 'utf8')) : null;
const sessionId = resumed || crypto.randomUUID();
const ask = prompt.split('\n').pop().trim();
out({ type: 'thought', data: 'Reading the question.' });
await sleep(delay);
if (/news|search|today|latest/i.test(ask)) {
  out({ type: 'tool_call', toolCallId: 'call_1', title: 'Search the web', kind: 'fetch', status: 'in_progress', toolName: 'web_search', rawInput: { query: ask } });
  await sleep(delay);
  out({ type: 'tool_call_update', toolCallId: 'call_1', status: 'completed', rawOutput: { results: 3 } });
}
const lines = [
  resumed ? `Picking up our conversation (${resumed.slice(0, 8)}). ` : '',
  `Grok here, on ${auth ? `the Grok sign-in of ${auth.account}` : 'an API key'}. `,
  `You said: "${ask.slice(0, 200)}". `,
  `Tools allowed: \`${tools}\`. API key in my environment: ${process.env.XAI_API_KEY ? 'yes' : 'none'}.`,
].filter(Boolean);
for (const piece of lines) {
  out({ type: 'text', data: piece });
  await sleep(delay);
}
out({ type: 'end', stopReason: 'end_turn', sessionId, requestId: 'req-standin', usage: { input_tokens: 40, output_tokens: 30 } });
