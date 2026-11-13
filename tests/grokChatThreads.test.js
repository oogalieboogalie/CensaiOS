// A Grok chat several people use: each person's Grok keeps its own
// conversation (server/grokSignin/chatThreads.js). Pat's first message starts
// Pat's; Sam's first starts Sam's own, handed the chat so far; each later
// message picks up its writer's own conversation, handed what the other said
// meanwhile. Runs the stand-in for xAI's Grok CLI, which keeps its
// conversations in each person's own Grok folder the way the real one does.
// All people and words are made up.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn as nodeSpawn } from 'child_process';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { grok } from '../server/cli-agents/adapters/grok.js';
import { personalHomeDir } from '../server/cli-agents/personalHome.js';
import { runGrokChat } from '../server/grokSignin/chatRun.js';
import { grokLogout } from '../server/grokSignin/login.js';
import { chatKey, fingerprint, readChatThread, saveChatThread } from '../server/grokSignin/chatThreads.js';
import { grokSigninRouter } from '../server/routes/grokSignin.js';

const STANDIN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cli-agents', 'standin-grok.mjs');
const PAT = 7;
const SAM = 8;
const CHAT = 'chat:made-up-window:1';

let dir;
let env;

function signIn(userId, account) {
  const home = personalHomeDir(grok, userId, env);
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, 'auth.json'), JSON.stringify({ account }));
}

/**
 * One turn in a chat: Grok's whole answer, or the error it stopped with.
 * `vars` set the stand-in's own switches for this turn.
 */
async function ask(userId, text, history, chat = CHAT, { vars = {}, onEvent, ...more } = {}) {
  const events = [];
  const emit = (event) => { events.push(event); onEvent?.(event); };
  const pass = ['STANDIN_DELAY_MS', ...Object.keys(vars)].join(',');
  const run = await runGrokChat({ userId, text, history, chat, emit, env: { ...env, ...vars, CENSAI_CLI_AGENT_ENV_PASS: pass }, ...more });
  return { ok: run.ok, said: events.find((e) => e.type === 'result')?.text || '', error: events.find((e) => e.type === 'error')?.error || null };
}

/** Starts Grok as usual, counting how many times. */
function counted() {
  const spawn = (...args) => { spawn.runs += 1; return nodeSpawn(...args); };
  spawn.runs = 0;
  return spawn;
}

const conversationOf = (said) => said.match(/(?:Starting a|Picking up our) conversation \(([^)]{8})\)/)?.[1] || null;
const me = (text) => ({ from: 'me', text });
const grokSaid = (text) => ({ from: 'agent', text });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grok-threads-'));
  env = { PATH: process.env.PATH, HOME: dir, CENSAI_CLI_AGENT_DATA: dir, CENSAI_CLI_GROK_BIN: STANDIN, STANDIN_DELAY_MS: '1', CENSAI_CLI_AGENT_ENV_PASS: 'STANDIN_DELAY_MS' };
  signIn(PAT, 'made-up-pat');
  signIn(SAM, 'made-up-sam');
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

test('two people writing in one Grok chat each keep their own conversation, handed what the other said', async () => {
  const pat1 = await ask(PAT, 'Made-up question one', []);
  expect(pat1.said).toMatch(/^Starting a conversation/);
  expect(pat1.said).not.toMatch(/handed/);
  const patConversation = conversationOf(pat1.said);

  // Sam's first message: Sam's own Grok, never asked to pick up Pat's, and handed the chat so far.
  const chat1 = [me('Made-up question one'), grokSaid(pat1.said)];
  const sam1 = await ask(SAM, 'Made-up question two', chat1);
  expect(sam1.ok).toBe(true);
  expect(sam1.said).toMatch(/^Starting a conversation/);
  expect(sam1.said).toMatch(/I was handed the chat so far \(2 messages\)/);
  expect(sam1.said).toMatch(/Grok sign-in of made-up-sam/);
  const samConversation = conversationOf(sam1.said);
  expect(samConversation).not.toBe(patConversation);

  // Each later message picks up its writer's own conversation, with only what the other said meanwhile.
  const chat2 = [...chat1, me('Made-up question two'), grokSaid(sam1.said)];
  const pat2 = await ask(PAT, 'Made-up question three', chat2);
  expect(conversationOf(pat2.said)).toBe(patConversation);
  expect(pat2.said).toMatch(/^Picking up our conversation .*I was handed 2 messages said meanwhile/);

  const chat3 = [...chat2, me('Made-up question three'), grokSaid(pat2.said)];
  const sam2 = await ask(SAM, 'Made-up question four', chat3);
  expect(conversationOf(sam2.said)).toBe(samConversation);
  expect(sam2.said).toMatch(/^Picking up our conversation .*I was handed 2 messages said meanwhile/);

  // Writing again with nothing said meanwhile hands nothing again.
  const sam3 = await ask(SAM, 'Made-up question five', [...chat3, me('Made-up question four'), grokSaid(sam2.said)]);
  expect(conversationOf(sam3.said)).toBe(samConversation);
  expect(sam3.said).not.toMatch(/handed/);
});

test('another chat starts another conversation, and a chat with no name keeps none', async () => {
  const one = await ask(PAT, 'Made-up question one', []);
  const other = await ask(PAT, 'Made-up question one', [], 'chat:made-up-window:2');
  expect(other.said).toMatch(/^Starting a conversation/);
  expect(conversationOf(other.said)).not.toBe(conversationOf(one.said));

  const unnamed = [me('Made-up question one'), grokSaid(one.said)];
  await ask(PAT, 'Made-up question one', [], null);
  const again = await ask(PAT, 'Made-up question two', unnamed, null);
  expect(again.said).toMatch(/^Starting a conversation .*I was handed the chat so far \(2 messages\)/);
});

test("each person's file is in their own Grok folder, private, and holds neither the chat's name nor its words", async () => {
  await ask(PAT, 'Made-up question one', [me('Made-up earlier words'), grokSaid('Made-up earlier answer')]);
  const file = path.join(personalHomeDir(grok, PAT, env), 'chat-threads.json');
  const saved = fs.readFileSync(file, 'utf8');
  expect(saved).not.toMatch(/made-up/i);
  expect(Object.keys(JSON.parse(saved))).toEqual([chatKey(CHAT)]);
  if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o077).toBe(0);
  expect(fs.existsSync(path.join(personalHomeDir(grok, SAM, env), 'chat-threads.json'))).toBe(false);
});

test('signing out forgets the conversations: the next sign-in starts new ones with the chat so far', async () => {
  await ask(PAT, 'Made-up question one', []);
  expect(readChatThread(PAT, chatKey(CHAT), env)).not.toBeNull();
  await grokLogout(PAT, { env });
  expect(readChatThread(PAT, chatKey(CHAT), env)).toBeNull();
  signIn(PAT, 'made-up-pat-again');
  const again = await ask(PAT, 'Made-up question two', [me('Made-up question one'), grokSaid('Made-up answer')]);
  expect(again.said).toMatch(/^Starting a conversation .*I was handed the chat so far \(2 messages\)/);
});

test('a conversation Grok cannot pick up is replaced in the same send by a new one handed the chat so far', async () => {
  // Say Grok's own folder lost it: Pat's conversation, handed the first two messages, is one Pat's Grok no longer has.
  const earlier = [me('Made-up question one'), grokSaid('Made-up answer one')];
  saveChatThread(PAT, chatKey(CHAT), { sessionId: 'made-up-lost-conversation', seen: earlier.map(fingerprint) }, env);
  const chat = [...earlier, me('Made-up question two'), grokSaid('Made-up answer two')];
  const lost = await ask(PAT, 'Made-up question three', chat);
  expect(lost).toMatchObject({ ok: true, error: null });
  expect(lost.said).toMatch(/^Starting a conversation .*I was handed the chat so far \(4 messages\)/);
  expect(conversationOf(lost.said)).toBe(readChatThread(PAT, chatKey(CHAT), env).sessionId.slice(0, 8));
  // The next message picks up the new one, which has the whole chat already.
  const next = await ask(PAT, 'Made-up question four', [...chat, me('Made-up question three'), grokSaid(lost.said)]);
  expect(next.said).toMatch(/^Picking up our conversation/);
  expect(next.said).not.toMatch(/handed/);
});

test("a hiccup while picking up keeps the person's conversation: the chat says what Grok said, and the next message picks it up", async () => {
  const first = await ask(PAT, 'Made-up question one', []);
  const own = readChatThread(PAT, chatKey(CHAT), env).sessionId;
  const chat = [me('Made-up question one'), grokSaid(first.said)];
  const spawn = counted();
  const hiccup = await ask(PAT, 'Made-up question two', chat, CHAT, { vars: { STANDIN_GROK_FAIL: 'Made-up usage limit.' }, spawn });
  expect(hiccup).toMatchObject({ ok: false, error: { code: 'GROK_CHAT_FAILED', message: 'Grok stopped: Made-up usage limit.' } });
  // A new conversation was tried too (it would have answered had Pat's been lost), and failed the same way.
  expect(spawn.runs).toBe(2);
  expect(readChatThread(PAT, chatKey(CHAT), env).sessionId).toBe(own);
  const again = await ask(PAT, 'Made-up question two', chat);
  expect(again.said).toMatch(/^Picking up our conversation/);
  expect(conversationOf(again.said)).toBe(own.slice(0, 8));
});

test('no new conversation is tried once Grok has begun answering, when the sign-in ran out, or when the turn ran out of time', async () => {
  await ask(PAT, 'Made-up question one', []);
  const own = readChatThread(PAT, chatKey(CHAT), env).sessionId;
  const spawn = counted();
  const late = await ask(PAT, 'Made-up question two', [], CHAT, { vars: { STANDIN_GROK_FAIL: 'Made-up hiccup.', STANDIN_GROK_FAIL_LATE: '1' }, spawn });
  expect(late.error).toMatchObject({ code: 'GROK_CHAT_FAILED' });
  expect(spawn.runs).toBe(1);
  const expired = await ask(PAT, 'Made-up question two', [], CHAT, { vars: { STANDIN_GROK_FAIL: '401 Unauthorized: made-up token expired' }, spawn });
  expect(expired.error).toMatchObject({ code: 'GROK_SIGNIN_REQUIRED' });
  expect(spawn.runs).toBe(2);
  const slow = await ask(PAT, 'Made-up question two', [], CHAT, { vars: { STANDIN_DELAY_MS: '400' }, spawn, turnLimitMs: 150 });
  expect(slow.error).toMatchObject({ code: 'GROK_CHAT_FAILED' });
  expect(spawn.runs).toBe(3);
  expect(readChatThread(PAT, chatKey(CHAT), env).sessionId).toBe(own);
});

test('when Grok quietly starts a new conversation instead of picking one up, the next message hands it what it missed', async () => {
  const forgets = { vars: { STANDIN_GROK_FORGETS: '1' } };
  // Pat's Grok was handed the first two messages, in a conversation its folder no longer has.
  const earlier = [me('Made-up question one'), grokSaid('Made-up answer one')];
  saveChatThread(PAT, chatKey(CHAT), { sessionId: 'made-up-lost-conversation', seen: earlier.map(fingerprint) }, env);
  const chat = [...earlier, me('Made-up question two'), grokSaid('Made-up answer two')];
  const quiet = await ask(PAT, 'Made-up question three', chat, CHAT, forgets);
  expect(quiet.said).toMatch(/^Starting a conversation .*I was handed 2 messages said meanwhile/);
  // That new conversation has only the last two, so the next message hands it the first two.
  const next = await ask(PAT, 'Made-up question four', [...chat, me('Made-up question three'), grokSaid(quiet.said)], CHAT, forgets);
  expect(next.said).toMatch(/^Picking up our conversation .*I was handed 2 messages said meanwhile/);
});

test('signing out while Grok is still answering keeps nothing for the next sign-in', async () => {
  let begun;
  const answerBegins = new Promise((resolve) => { begun = resolve; });
  const answering = ask(PAT, 'Made-up question one', [], CHAT, { vars: { STANDIN_DELAY_MS: '250' }, onEvent: (event) => event.type === 'delta' && begun() });
  await answerBegins;
  await grokLogout(PAT, { env });
  expect((await answering).ok).toBe(true);
  expect(readChatThread(PAT, chatKey(CHAT), env)).toBeNull();
});

test('the newest 200 chats stay, even when saved in the same millisecond, with the newest 60 fingerprints of each', () => {
  const keyOf = (i) => chatKey(`chat:made-up-window:${i}`);
  const save = (i, seen = [`f${i}`]) => saveChatThread(PAT, keyOf(i), { sessionId: `made-up-${i}`, seen }, env);
  const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
  try {
    for (let i = 0; i < 200; i += 1) save(i);
    // Chat 0 is used again, then five new chats start: chat 0 stays, and the five oldest others go.
    save(0, ['f0', 'g0']);
    for (let i = 200; i < 205; i += 1) save(i);
  } finally {
    now.mockRestore();
  }
  const all = JSON.parse(fs.readFileSync(path.join(personalHomeDir(grok, PAT, env), 'chat-threads.json'), 'utf8'));
  expect(Object.keys(all)).toHaveLength(200);
  expect(readChatThread(PAT, keyOf(0), env)).toEqual({ sessionId: 'made-up-0', seen: ['f0', 'g0'] });
  expect([200, 201, 202, 203, 204].every((i) => readChatThread(PAT, keyOf(i), env))).toBe(true);
  expect([1, 2, 3, 4, 5].some((i) => readChatThread(PAT, keyOf(i), env))).toBe(false);

  const seen = Array.from({ length: 70 }, (_, i) => `f${i}`);
  saveChatThread(PAT, chatKey(CHAT), { sessionId: 'made-up-long', seen: [...seen, 'f0'] }, env);
  const kept = readChatThread(PAT, chatKey(CHAT), env).seen;
  expect(kept).toHaveLength(60);
  expect(kept.at(-1)).toBe('f0');
});

test('through the route, the server picks the conversation: one a browser names is never picked up', async () => {
  const before = { ...process.env };
  Object.assign(process.env, env);
  try {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.session = { userId: PAT }; next(); });
    app.use(grokSigninRouter);
    const turn = async (body) => {
      const res = await request(app).post('/chat').send(body).buffer(true)
        .parse((stream, done) => { let text = ''; stream.on('data', (chunk) => { text += chunk; }); stream.on('end', () => done(null, text)); });
      return res.body.split('\n').filter(Boolean).map((line) => JSON.parse(line)).find((event) => event.type === 'result')?.text || '';
    };
    const first = await turn({ text: 'Made-up question one', chat: CHAT });
    const own = conversationOf(first);
    expect(first).toMatch(/^Starting a conversation/);
    // Say a browser names someone else's conversation: the server still picks up Pat's own.
    const second = await turn({ text: 'Made-up question two', chat: CHAT, sessionId: 'made-up-someone-elses', history: [me('Made-up question one'), grokSaid(first)] });
    expect(conversationOf(second)).toBe(own);
    expect(second).toMatch(/^Picking up our conversation/);
    expect(second).not.toMatch(/handed/);
  } finally {
    for (const name of Object.keys(env)) {
      if (name in before) process.env[name] = before[name];
      else delete process.env[name];
    }
  }
});
