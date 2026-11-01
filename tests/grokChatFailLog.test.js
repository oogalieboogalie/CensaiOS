// When a Grok chat on someone's own Grok sign-in fails, the person's chat
// shows Grok's own words, but censaiOS's log keeps only a short code for how
// it ended and the exit number: Grok's words can name a folder on this
// computer or repeat what someone asked (server/grokSignin/chatRun.js). The
// person, folders and words are all made up.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import { grok } from '../server/cli-agents/adapters/grok.js';
import { personalHomeDir } from '../server/cli-agents/personalHome.js';
import { runGrokChat } from '../server/grokSignin/chatRun.js';
import { onLogRecord } from '../server/logger.js';

const STANDIN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cli-agents', 'standin-grok.mjs');
const FOLDER = '/home/made-up-person/made-up-plans';
const WORDS = 'Made-up trouble with the made-up garden plan';

let dir;
let env;
let records;
let stopListening;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grok-fail-log-'));
  env = { PATH: process.env.PATH, HOME: dir, CENSAI_CLI_AGENT_DATA: dir, CENSAI_CLI_GROK_BIN: STANDIN };
  // Signed in to their own Grok, as far as censaiOS can tell.
  const home = personalHomeDir(grok, 7, env);
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, 'auth.json'), '{}');
  records = [];
  stopListening = onLogRecord((record) => records.push(record));
});
afterEach(() => {
  stopListening();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** A Grok run that does `act(child)` a moment after it starts. */
const grokThat = (act) => () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => { setTimeout(() => child.emit('close', null), 1); };
  setTimeout(() => act(child), 5);
  return child;
};
const says = (child, event) => child.stdout.emit('data', Buffer.from(`${JSON.stringify(event)}\n`));

async function chatThatFails(spawn, extra = {}) {
  const events = [];
  const result = await runGrokChat({ userId: 7, text: 'Made-up question about the garden', emit: (e) => events.push(e), env, spawn, ...extra });
  const failed = records.find((r) => r.namespace === 'grok-signin' && r.message === 'grok chat failed');
  const logged = JSON.stringify(records.filter((r) => r.namespace === 'grok-signin'));
  return { result, shown: events.find((e) => e.type === 'error')?.error, failed, logged };
}

test("Grok's own error words, naming a folder, show in the chat and never in the log", async () => {
  const { result, shown, failed, logged } = await chatThatFails(grokThat((child) => {
    says(child, { type: 'error', message: `${WORDS}: could not read ${FOLDER}/notes.txt` });
    child.emit('close', 1);
  }));
  expect(result).toEqual({ ok: false, code: 'GROK_CHAT_FAILED' });
  expect(shown.message).toBe(`Grok stopped: ${WORDS}: could not read ${FOLDER}/notes.txt`);
  expect(failed.meta).toEqual({ userId: 7, ms: expect.any(Number), code: 'GROK_CHAT_FAILED', how: 'grok_said_error', exit: 1 });
  expect(logged).not.toContain('made-up-plans');
  expect(logged).not.toContain(WORDS);
});

test("Grok's last line of error output shows in the chat, and the log says only that it wrote some", async () => {
  const { shown, failed, logged } = await chatThatFails(grokThat((child) => {
    child.stderr.emit('data', Buffer.from(`Made-up panic in ${FOLDER}/grok.rs line 12\n${WORDS}\n`));
    child.emit('close', 101);
  }));
  expect(shown.message).toBe(`Grok stopped: ${WORDS}`);
  expect(failed.meta).toMatchObject({ code: 'GROK_CHAT_FAILED', how: 'error_output', exit: 101 });
  expect(logged).not.toContain('made-up-plans');
  expect(logged).not.toContain(WORDS);
});

test('Grok that could not start is logged with the error\'s code, not its message naming a folder', async () => {
  const { shown, failed, logged } = await chatThatFails(grokThat((child) => {
    child.emit('error', Object.assign(new Error(`spawn ${FOLDER}/grok ENOENT`), { code: 'ENOENT' }));
  }));
  expect(shown.message).toBe(`Grok stopped: spawn ${FOLDER}/grok ENOENT`);
  expect(failed.meta).toMatchObject({ code: 'GROK_CHAT_FAILED', how: 'could_not_start', exit: null, startCode: 'ENOENT' });
  expect(logged).not.toContain('made-up-plans');
});

test('Grok that exits without a word, or runs past the turn limit, is logged as such', async () => {
  const silent = await chatThatFails(grokThat((child) => child.emit('close', 3)));
  expect(silent.shown.message).toBe('Grok stopped: Grok exited with code 3.');
  expect(silent.failed.meta).toMatchObject({ how: 'exited', exit: 3 });
  expect(silent.failed.meta).not.toHaveProperty('startCode');
  records.length = 0;
  const slow = await chatThatFails(grokThat(() => {}), { turnLimitMs: 20 });
  expect(slow.failed.meta).toMatchObject({ code: 'GROK_CHAT_FAILED', how: 'timed_out' });
});

test('a sign-in that ran out still asks the person to sign in again, and its words stay out of the log', async () => {
  const { result, shown, failed, logged } = await chatThatFails(grokThat((child) => {
    says(child, { type: 'error', message: `401 Unauthorized: made-up token for ${FOLDER} expired` });
    child.emit('close', 1);
  }));
  expect(result.code).toBe('GROK_SIGNIN_REQUIRED');
  expect(shown.message).toMatch(/Sign in to Grok again/);
  expect(failed.meta).toMatchObject({ code: 'GROK_SIGNIN_REQUIRED', how: 'grok_said_error', exit: 1 });
  expect(logged).not.toContain('made-up-plans');
  expect(logged).not.toContain('Unauthorized');
});

test('the stand-in Grok fails a turn that asks it to, naming its own folder', async () => {
  const events = [];
  const result = await runGrokChat({ userId: 7, text: 'Made-up question [stand-in fails this turn]', emit: (e) => events.push(e), env });
  expect(result.code).toBe('GROK_CHAT_FAILED');
  const shown = events.find((e) => e.type === 'error').error.message;
  expect(shown).toBe(`Grok stopped: Made-up trouble reading ${path.join(personalHomeDir(grok, 7, env), 'made-up-notes.txt')}`);
  const logged = JSON.stringify(records.filter((r) => r.namespace === 'grok-signin'));
  expect(logged).not.toContain('made-up-notes.txt');
  expect(logged).not.toContain(dir);
});
