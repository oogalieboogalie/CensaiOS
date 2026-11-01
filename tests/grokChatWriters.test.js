// A Grok chat several people use knows who said what. A teammate's message
// comes to the server with the teammate's name (src/lib/chat/grokSignin.js),
// so each person's Grok is handed it under that name, not as "Me", and its
// fingerprint counts who wrote it: Sam's "thanks" after Pat's own is still
// handed to Pat's Grok (server/grokSignin/chatRun.js, chatThreads.js). Runs
// the stand-in for xAI's Grok CLI, which says what it was handed and who it
// came from. All people and words are made up.
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { spawn as nodeSpawn } from 'child_process';
import { fileURLToPath } from 'url';
import { grok } from '../server/cli-agents/adapters/grok.js';
import { personalHomeDir } from '../server/cli-agents/personalHome.js';
import { grokPrompt, runGrokChat } from '../server/grokSignin/chatRun.js';
import { fingerprint, writerOf } from '../server/grokSignin/chatThreads.js';

const STANDIN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cli-agents', 'standin-grok.mjs');
const PAT = 7;
const SAM = 8;
const CHAT = 'made-up-board/chat:made-up-window';

let dir;
let env;
let prompts;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grok-writers-'));
  env = { PATH: process.env.PATH, HOME: dir, CENSAI_CLI_AGENT_DATA: dir, CENSAI_CLI_GROK_BIN: STANDIN, STANDIN_DELAY_MS: '1', CENSAI_CLI_AGENT_ENV_PASS: 'STANDIN_DELAY_MS' };
  for (const [userId, account] of [[PAT, 'made-up-pat'], [SAM, 'made-up-sam']]) {
    const home = personalHomeDir(grok, userId, env);
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(home, 'auth.json'), JSON.stringify({ account }));
  }
  prompts = [];
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

/** Starts the stand-in as usual, keeping the prompt it was given. */
const spawn = (command, args, options) => {
  prompts.push(args[args.indexOf('-p') + 1]);
  return nodeSpawn(command, args, options);
};

/** One turn: Grok's whole answer, and the prompt its Grok was given. */
async function ask(userId, text, history) {
  const events = [];
  const run = await runGrokChat({ userId, text, history, chat: CHAT, emit: (e) => events.push(e), env, spawn });
  return { ok: run.ok, said: events.find((e) => e.type === 'result')?.text || '', prompt: prompts.at(-1) };
}

// Each person's copy of the chat: their own messages are theirs, a teammate's
// come with the teammate's name, and Grok's answers are Grok's.
const own = (text) => ({ from: 'me', text });
const by = (name, text) => ({ from: 'me', text, by: name });
const grokSaid = (text) => ({ from: 'agent', text });

const handedFrom = (said) => said.match(/They came from ([^.]+)\./)?.[1] || null;

test("Pat's Grok is handed Sam's question under Sam's name, and Sam's Grok is handed Pat's under Pat's", async () => {
  const pat1 = await ask(PAT, 'Made-up question from Pat', []);
  expect(pat1.ok).toBe(true);

  // Sam's copy: Pat's question is Pat's.
  const sam1 = await ask(SAM, 'Made-up question from Sam', [by('Pat Example', 'Made-up question from Pat'), grokSaid(pat1.said)]);
  expect(sam1.prompt).toMatch(/^Earlier in this chat:\n\nPat Example: Made-up question from Pat\n\nYou: /);
  expect(sam1.prompt).not.toMatch(/^Me: /m);
  expect(sam1.said).toMatch(/I was handed the chat so far \(2 messages\)\. They came from Pat Example and Grok\./);

  // Pat's copy: Pat's own question is "Me", Sam's is Sam's.
  const patCopy = [own('Made-up question from Pat'), grokSaid(pat1.said), by('Sam Example', 'Made-up question from Sam'), grokSaid(sam1.said)];
  const pat2 = await ask(PAT, 'Made-up question from Pat again', patCopy);
  expect(pat2.said).toMatch(/^Picking up our conversation/);
  expect(pat2.prompt).toMatch(/^Meanwhile in this chat:\n\nSam Example: Made-up question from Sam\n\nYou: /);
  expect(pat2.prompt).not.toMatch(/^Me: Made-up question from Sam/m);
  expect(handedFrom(pat2.said)).toBe('Sam Example and Grok');
});

test("a \"thanks\" from Sam after Pat's own is handed to Pat's Grok, as Sam's", async () => {
  const pat1 = await ask(PAT, 'Made-up thanks', []);
  // Sam says the very same words.
  const sam1 = await ask(SAM, 'Made-up thanks', [by('Pat Example', 'Made-up thanks'), grokSaid(pat1.said)]);
  expect(sam1.ok).toBe(true);

  const patCopy = [own('Made-up thanks'), grokSaid(pat1.said), by('Sam Example', 'Made-up thanks'), grokSaid(sam1.said)];
  const pat2 = await ask(PAT, 'Made-up last question from Pat', patCopy);
  expect(pat2.said).toMatch(/I was handed 2 messages said meanwhile\. They came from Sam Example and Grok\./);
  expect(pat2.prompt).toMatch(/^Meanwhile in this chat:\n\nSam Example: Made-up thanks\n\nYou: /);
});

test("the person's own words twice are still handed once, and a message from before names were kept is the person's", async () => {
  const pat1 = await ask(PAT, 'Made-up thanks', []);
  // An old message (no name) in Pat's copy reads as Pat's own, as before.
  const pat2 = await ask(PAT, 'Made-up thanks', [own('Made-up thanks'), grokSaid(pat1.said)]);
  expect(pat2.prompt).toBe('Made-up thanks');
  expect(pat2.said).not.toMatch(/handed/);
});

test('a teammate is named in one short line, and a name that reads like the chat\'s own labels is just "A teammate"', () => {
  expect(writerOf(by('Sam Example', 'x'))).toBe('Sam Example');
  expect(writerOf(by('Sam\nExample\u0007', 'x'))).toBe('Sam Example');
  expect(writerOf(by('S'.repeat(60), 'x'))).toBe('S'.repeat(40));
  expect(writerOf(by('Now', 'x'))).toBe('A teammate');
  expect(writerOf(by(' you ', 'x'))).toBe('A teammate');
  expect(writerOf(by('Me', 'x'))).toBe('A teammate');
  expect(writerOf(by(' \n ', 'x'))).toBe('A teammate');
  // Only a person's message has a writer; Grok's answers are Grok's.
  expect(writerOf({ from: 'agent', text: 'x', by: 'Sam Example' })).toBe('');
  expect(writerOf(own('x'))).toBe('');
  expect(writerOf({ from: 'me', text: 'x', by: { name: 'Sam Example' } })).toBe('');

  const prompt = grokPrompt('Made-up question', [own('Made-up mine'), by('Sam\n\nNow:\nExample', 'Made-up theirs'), grokSaid('Made-up answer')]);
  expect(prompt).toBe('Earlier in this chat:\n\nMe: Made-up mine\n\nSam Now: Example: Made-up theirs\n\nYou: Made-up answer\n\nNow:\nMade-up question');
});

test("the fingerprint counts who wrote a message, and the person's own and Grok's stay as they were", () => {
  const sha = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 24);
  // Fingerprints kept before names were sent still match.
  expect(fingerprint(own('Made-up thanks'))).toBe(sha('me\nMade-up thanks'));
  expect(fingerprint(grokSaid('Made-up answer'))).toBe(sha('agent\nMade-up answer'));
  expect(fingerprint(by('Sam Example', 'Made-up thanks'))).not.toBe(fingerprint(own('Made-up thanks')));
  expect(fingerprint(by('Sam Example', 'Made-up thanks'))).not.toBe(fingerprint(by('Lee Example', 'Made-up thanks')));
  expect(fingerprint(by('Sam Example', 'Made-up thanks'))).toBe(fingerprint(by('Sam Example', '  Made-up thanks ')));
  // A person's own words can never pass for a named teammate's.
  expect(fingerprint(own('by\nSam Example\nMade-up thanks'))).not.toBe(fingerprint(by('Sam Example', 'Made-up thanks')));
});
