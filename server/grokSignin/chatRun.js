import fs from 'fs';
import path from 'path';
import { spawn as nodeSpawn } from 'child_process';
import { createLogger } from '../logger.js';
import { grok } from '../cli-agents/adapters/grok.js';
import { resolveCli, managedBinDir } from '../cli-agents/install.js';
import { buildAgentEnv } from '../cli-agents/env.js';
import { agentHome } from '../cli-agents/paths.js';
import { personalHomeDir, personalSignedIn } from '../cli-agents/personalHome.js';

/**
 * The Grok chat on "Use my Grok sign-in": one chat turn through xAI's own
 * Grok CLI (Grok Build), headless, on the person's own Grok account (their
 * SuperGrok or Grok Heavy plan), in their own GROK_HOME. No API key is ever
 * handed to it, so the turn runs on the subscription, not on API credits.
 *
 * It is a chat, not a coding agent: only Grok's web tools are allowed
 * (`--tools web_search,web_fetch`), in an empty folder of that person's own,
 * so a message can never make it run commands or change files.
 */

const log = createLogger('grok-signin');
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const CHAT_TOOLS = 'web_search,web_fetch';
const TURN_LIMIT_MS = 10 * 60 * 1000;
const MAX_PROMPT_CHARS = 60_000;

export class GrokChatError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function grokChatArgs({ prompt, sessionId = null }) {
  const args = ['-p', prompt, '--output-format', 'streaming-json', '--tools', CHAT_TOOLS, '--no-auto-update', '--max-turns', '12'];
  if (sessionId && SAFE_ID.test(sessionId)) args.push('-r', sessionId);
  return args;
}

/** First turn of a chat that already has messages (say, from the key): carry them in. */
export function grokPrompt(text, history = []) {
  const earlier = history
    .filter((m) => m && typeof m.text === 'string' && m.text.trim())
    .slice(-12)
    .map((m) => `${m.from === 'me' ? 'Me' : 'You'}: ${m.text.trim()}`)
    .join('\n\n');
  const prompt = earlier ? `Earlier in this chat:\n\n${earlier}\n\nNow:\n${text}` : text;
  return prompt.length > MAX_PROMPT_CHARS ? prompt.slice(-MAX_PROMPT_CHARS) : prompt;
}

/** Readiness for this person: installed, and signed in to their own Grok. */
export function grokReadiness(userId, env = process.env) {
  const launch = resolveCli(grok.id, env);
  return { installed: Boolean(launch), signedIn: personalSignedIn(grok, userId, env), launch };
}

function signInWords(text) {
  return /(not (signed|logged) in|sign in|log ?in|unauthori[sz]ed|\b401\b|auth(entication)? (failed|required)|expired)/i.test(text);
}

/**
 * Run one turn. `emit(event)` gets the chat stream's own events (delta,
 * status, result, error) so the browser reads it like any other chat.
 * Resolves when Grok has finished; `signal` (the request closing) stops it.
 */
export function runGrokChat({ userId, text, history = [], sessionId = null, emit, signal, env = process.env, spawn = nodeSpawn }) {
  const ready = grokReadiness(userId, env);
  if (!ready.installed) throw new GrokChatError('Grok is not installed in censaiOS yet.', 'GROK_NOT_INSTALLED', 409);
  if (!ready.signedIn) throw new GrokChatError('Sign in to your own Grok account first.', 'GROK_SIGNIN_REQUIRED', 409);

  const home = personalHomeDir(grok, userId, env);
  const cwd = path.join(home, 'chat');
  fs.mkdirSync(cwd, { recursive: true });
  const lasting = agentHome(env);
  if (lasting) fs.mkdirSync(lasting, { recursive: true });
  const runEnv = buildAgentEnv({ source: env, managedBin: managedBinDir(env), home: lasting, personal: { adapter: grok, userId }, serverKeys: false });
  // The subscription, never API credits: no key reaches this run.
  delete runEnv.XAI_API_KEY;

  const prompt = grokPrompt(text, sessionId ? [] : history);
  const args = [...ready.launch.prefixArgs, ...grokChatArgs({ prompt, sessionId })];
  const started = Date.now();
  log.info('grok chat started', { userId, resume: Boolean(sessionId) });

  return new Promise((resolve) => {
    const child = spawn(ready.launch.command, args, { cwd, env: runEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let buffer = '';
    let reply = '';
    let stderr = '';
    let ended = null;
    let failed = null;
    const tools = new Map();
    const timer = setTimeout(() => child.kill('SIGTERM'), TURN_LIMIT_MS);
    const onAbort = () => child.kill('SIGTERM');
    signal?.addEventListener?.('abort', onAbort);

    const handle = (event) => {
      if (!event || typeof event !== 'object') return;
      if (event.type === 'text' && typeof event.data === 'string') {
        reply += event.data;
        emit({ type: 'delta', text: event.data, round: 1 });
      } else if (event.type === 'thought') {
        emit({ type: 'status', status: 'thinking', detail: null });
      } else if (event.type === 'tool_call') {
        const tool = event.title || event.toolName || 'Search';
        tools.set(event.toolCallId, { tool, at: Date.now() });
        emit({ type: 'status', status: 'calling_tool', detail: { tool } });
      } else if (event.type === 'tool_call_update' && /completed|failed|error/.test(String(event.status))) {
        const call = tools.get(event.toolCallId) || { tool: 'Search', at: Date.now() };
        emit({ type: 'status', status: 'completed_tool', detail: { tool: call.tool, ms: Date.now() - call.at, ok: event.status === 'completed' } });
      } else if (event.type === 'end') {
        ended = event;
      } else if (event.type === 'error') {
        failed = String(event.message || 'Grok stopped with an error.');
      }
    };
    const onLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) return;
      try { handle(JSON.parse(trimmed)); } catch { /* not a JSON line */ }
    };

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        onLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-4000); });
    let settled = false;
    const finish = (code, startError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      if (buffer) onLine(buffer);
      const ms = Date.now() - started;
      if (!startError && ended && !failed && ended.stopReason !== 'error') {
        const newSession = SAFE_ID.test(String(ended.sessionId || '')) ? ended.sessionId : null;
        emit({ type: 'result', text: reply, grokSessionId: newSession, timings: { total_ms: ms } });
        log.info('grok chat finished', { userId, ms, stopReason: ended.stopReason || null });
        resolve({ ok: true });
        return;
      }
      const why = startError?.message || failed || stderr.trim().split(/\r?\n/).pop() || `Grok exited with code ${code}.`;
      const code2 = signal?.aborted ? 'CHAT_ABORTED' : signInWords(`${failed || ''} ${stderr}`) ? 'GROK_SIGNIN_REQUIRED' : 'GROK_CHAT_FAILED';
      const message = code2 === 'GROK_SIGNIN_REQUIRED' ? 'Your Grok sign-in has run out. Sign in to Grok again, then send this once more.' : `Grok stopped: ${why}`;
      if (!signal?.aborted) emit({ type: 'error', error: { message, code: code2 } });
      log.warn('grok chat failed', { userId, ms, code: code2, exit: code, reason: why.slice(0, 300) });
      resolve({ ok: false, code: code2 });
    };
    child.on('error', (err) => finish(null, err));
    child.on('close', (code) => finish(code));
  });
}
