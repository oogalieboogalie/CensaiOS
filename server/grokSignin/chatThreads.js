// server/grokSignin/chatThreads.js
//
// Each person's own Grok conversation in each chat. A chat on a shared board
// is one window everyone sees, but each person's Grok runs on their own
// sign-in in their own folder, so each keeps their own conversation: Sam's
// first message never asks Sam's Grok to pick up Pat's. It is kept here, in
// that person's own Grok folder, never on the shared window.
//
// Per chat: the conversation to pick up, and which of the chat's messages it
// has been handed, as fingerprints (never the words), so a person's next
// message hands their Grok only what was said meanwhile.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { grok } from '../cli-agents/adapters/grok.js';
import { personalHomeDir } from '../cli-agents/personalHome.js';

const FILE = 'chat-threads.json';
const MAX_CHATS = 200;
// Each message hands over at most 12 earlier ones, so a few turns' worth is plenty.
const MAX_SEEN = 60;
// The browser sends each earlier message cut to this many characters (src/lib/chat/grokSignin.js).
const TEXT_LIMIT = 8000;

const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');

/** A chat's key in the file, so the chat's own name never lands on disk. */
export function chatKey(chat) {
  const name = typeof chat === 'string' ? chat.slice(0, 300) : '';
  return name ? hash(`chat\n${name}`).slice(0, 32) : null;
}

/** Who said a message (the person or Grok) and its words, as a fingerprint. */
export function fingerprint(message) {
  const from = message?.from === 'me' ? 'me' : 'agent';
  return hash(`${from}\n${String(message?.text ?? '').slice(0, TEXT_LIMIT).trim()}`).slice(0, 24);
}

function fileOf(userId, env) {
  const home = personalHomeDir(grok, userId, env);
  return home ? path.join(home, FILE) : null;
}

function readAll(file) {
  try {
    const all = JSON.parse(fs.readFileSync(file, 'utf8'));
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
  } catch {
    return {};
  }
}

function writeAll(file, all) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const draft = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(draft, JSON.stringify(all), { mode: 0o600 });
  fs.renameSync(draft, file);
}

/** Newest last, each once. */
function lastOfEach(list) {
  const kept = new Set();
  for (const item of list) {
    kept.delete(item);
    kept.add(item);
  }
  return [...kept];
}

/** This person's conversation in this chat: { sessionId, seen }, or null when they have none yet. */
export function readChatThread(userId, key, env = process.env) {
  const file = key ? fileOf(userId, env) : null;
  const thread = file ? readAll(file)[key] : null;
  if (typeof thread?.sessionId !== 'string' || !Array.isArray(thread.seen)) return null;
  return { sessionId: thread.sessionId, seen: thread.seen };
}

/** Keeps this person's conversation in this chat; the newest MAX_CHATS chats stay. */
export function saveChatThread(userId, key, { sessionId, seen }, env = process.env) {
  const file = key ? fileOf(userId, env) : null;
  if (!file) return;
  // The file lists chats oldest first, so of two saved in the same millisecond the later one counts as newer.
  const all = readAll(file);
  delete all[key];
  all[key] = { sessionId, seen: lastOfEach(seen).slice(-MAX_SEEN), at: Date.now() };
  const newest = Object.entries(all).reverse().sort(([, a], [, b]) => (b?.at || 0) - (a?.at || 0)).slice(0, MAX_CHATS);
  writeAll(file, Object.fromEntries(newest.reverse()));
}

/** Forgets all of this person's conversations (they signed out of Grok). */
export function forgetChatThreads(userId, env = process.env) {
  const file = fileOf(userId, env);
  if (file) fs.rmSync(file, { force: true });
}
