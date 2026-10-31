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
 *                              refuses without auth.json, or to pick up a
 *                              conversation its folder does not have;
 *                              otherwise streams thought / tool_call / text /
 *                              end lines, naming the conversation and how
 *                              many earlier messages the prompt handed it
 *   grok --prompt-file <path> ...   the same, with the prompt in a file
 *
 * STANDIN_GROK_EDIT=<file> makes a task write that file under --cwd, the way
 * an edit would; STANDIN_GROK_FAIL=<message> makes it fail with that error,
 * before it says a word (or after its answer's words, with
 * STANDIN_GROK_FAIL_LATE=1). STANDIN_GROK_FORGETS=1 makes it start a new
 * conversation, without a word, when asked to pick up one it does not have.
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

// What the real `grok login --device-auth` (1.0.70) prints on a runner with
// no browser, line for line. STANDIN_GROK_SPLIT=1 writes it in pieces that
// cut the link before and inside its code, and a colour code in two, the way
// a pipe can hand over one line in parts.
if (argv[0] === 'login') {
  const said = [
    '', 'To sign in, open this URL in your browser:', '', '  https://accounts.x.ai/oauth2/device?user_code=WXYZ-4821', '',
    '  (Could not open browser automatically — open the URL above manually.)', '',
    'Confirm this code in your browser:', '', '  WXYZ-4821', '',
    "\u001b[90mOnly continue with a code you requested. Don't share it with anyone.\u001b[0m", '',
    'Waiting for authorization...', '',
  ].join('\n');
  const cuts = process.env.STANDIN_GROK_SPLIT ? ['user_co', 'user_code=WXYZ-48', '\u001b[9'].map((at) => said.indexOf(at) + at.length) : [];
  for (const [i, end] of [...cuts, said.length].entries()) {
    process.stderr.write(said.slice(i ? cuts[i - 1] : 0, end));
    if (end < said.length) await sleep(40);
  }
  await sleep(Number(process.env.STANDIN_GROK_LOGIN_MS || 1500));
  fs.mkdirSync(home, { recursive: true });
  // STANDIN_GROK_ACCOUNT_FROM_HOME=1 names each sign-in after its folder, so two people's answers tell whose sign-in ran.
  const account = process.env.STANDIN_GROK_ACCOUNT || (process.env.STANDIN_GROK_ACCOUNT_FROM_HOME ? path.basename(home) : 'standin');
  fs.writeFileSync(authFile, JSON.stringify({ access_token: 'standin-token', account }));
  process.stderr.write('✓ Signed in\n');
  process.exit(0);
}

if (argv[0] === 'logout') {
  fs.rmSync(authFile, { force: true });
  process.exit(0);
}

const promptAt = argv.indexOf('-p');
const promptFileAt = argv.indexOf('--prompt-file');
if (promptAt < 0 && promptFileAt < 0) {
  process.stderr.write('stand-in grok: only headless -p is supported\n');
  process.exit(2);
}
const prompt = promptAt >= 0 ? argv[promptAt + 1] || '' : fs.readFileSync(argv[promptFileAt + 1], 'utf8');
const resumeAt = argv.indexOf('-r');
const resumed = resumeAt >= 0 ? argv[resumeAt + 1] : null;
const tools = argv.includes('--tools') ? argv[argv.indexOf('--tools') + 1] : 'all';

if (!fs.existsSync(authFile) && !process.env.XAI_API_KEY) {
  out({ type: 'error', message: 'Not signed in. Run `grok login` to sign in.' });
  process.exit(1);
}

const auth = fs.existsSync(authFile) ? JSON.parse(fs.readFileSync(authFile, 'utf8')) : null;
// Like the real one, it keeps its conversations in its own folder, so it
// cannot pick up one that another person's Grok started.
const conversations = path.join(home, 'standin-conversations');
const picked = Boolean(resumed) && fs.existsSync(path.join(conversations, path.basename(resumed)));
if (resumed && !picked && !process.env.STANDIN_GROK_FORGETS) {
  out({ type: 'error', message: `No conversation ${resumed.slice(0, 8)} in this Grok folder.` });
  process.exit(1);
}
const sessionId = picked ? resumed : crypto.randomUUID();
fs.mkdirSync(conversations, { recursive: true });
fs.writeFileSync(path.join(conversations, sessionId), '');
const ask = prompt.split('\n').pop().trim();
out({ type: 'thought', data: 'Reading the question.' });
await sleep(delay);
const fail = () => {
  out({ type: 'error', message: process.env.STANDIN_GROK_FAIL });
  process.exit(1);
};
if (process.env.STANDIN_GROK_FAIL && !process.env.STANDIN_GROK_FAIL_LATE) fail();
if (process.env.STANDIN_GROK_EDIT) {
  const cwdAt = argv.indexOf('--cwd');
  const target = path.join(cwdAt >= 0 ? argv[cwdAt + 1] : process.cwd(), process.env.STANDIN_GROK_EDIT);
  out({ type: 'tool_call', toolCallId: 'call_edit', title: `Edit ${path.basename(target)}`, kind: 'edit', status: 'in_progress', toolName: 'search_replace', rawInput: { path: target } });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${ask.slice(0, 80)}\n`);
  out({ type: 'tool_call_update', toolCallId: 'call_edit', status: 'completed' });
}
if (/news|search|today|latest/i.test(ask)) {
  out({ type: 'tool_call', toolCallId: 'call_1', title: 'Search the web', kind: 'fetch', status: 'in_progress', toolName: 'web_search', rawInput: { query: ask } });
  await sleep(delay);
  out({ type: 'tool_call_update', toolCallId: 'call_1', status: 'completed', rawOutput: { results: 3 } });
}
// What the chat handed over before the message (server/grokSignin/chatRun.js, grokPrompt).
const handedKind = /^Earlier in this chat:/.test(prompt) ? 'earlier' : /^Meanwhile in this chat:/.test(prompt) ? 'meanwhile' : null;
const handed = handedKind ? (prompt.slice(0, prompt.lastIndexOf('\n\nNow:\n')).match(/^(Me|You): /gm) || []).length : 0;
const lines = [
  picked ? `Picking up our conversation (${resumed.slice(0, 8)}). ` : `Starting a conversation (${sessionId.slice(0, 8)}). `,
  handedKind === 'earlier' ? `I was handed the chat so far (${handed} messages). ` : '',
  handedKind === 'meanwhile' ? `I was handed ${handed} messages said meanwhile. ` : '',
  `Grok here, on ${auth ? `the Grok sign-in of ${auth.account}` : 'an API key'}. `,
  `You said: "${ask.slice(0, 200)}". `,
  `Tools allowed: \`${tools}\`. API key in my environment: ${process.env.XAI_API_KEY ? 'yes' : 'none'}.`,
].filter(Boolean);
for (const piece of lines) {
  out({ type: 'text', data: piece });
  await sleep(delay);
}
if (process.env.STANDIN_GROK_FAIL) fail();
out({ type: 'end', stopReason: 'end_turn', sessionId, requestId: 'req-standin', usage: { input_tokens: 40, output_tokens: 30 } });
