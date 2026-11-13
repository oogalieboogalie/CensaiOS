// A command is recorded when the terminal echoes it, or from a nonce marker.
// Nothing here is written to the app log.

const ESC = '\u001b';
const BEL = '\u0007';
const ANSI = new RegExp(`${ESC}(?:\\[[0-9;?]*[A-Za-z]|\\][^${BEL}]*(?:${BEL}|${ESC}\\\\))`, 'g');
const MAX_OUTPUT = 20000;
const MAX_COMMANDS = 200;
const SECRET_WORD = /(?:password|passphrase|\btoken\b|\bkey\b|\bsecret\b|\bpin\b|\botp\b)/i;

function clean(text) {
  ANSI.lastIndex = 0;
  return String(text ?? '').replace(ANSI, '').replace(/\r/g, '');
}
function lastLine(text) {
  return String(text || '').split('\n').reverse().find((line) => line.trim()) || '';
}
function looksSecret(line) {
  const text = String(line || '').trim();
  if (!text || text.length > 180) return false;
  if (/\[sudo\]/i.test(text)) return true;
  return SECRET_WORD.test(text) && /[:?]\s*$/.test(text);
}
function endsWithPrompt(text) {
  const last = lastLine(text);
  if (!last || last.length > 120 || looksSecret(last)) return false;
  return /[$#%]\s*$/.test(last) || /^.{0,80}>\s*$/.test(last);
}
function echoedBack(buf, command) {
  if (!command) return false;
  let line = '';
  for (const ch of String(buf || '').split('\n')[0]) {
    if (ch === '\b' || ch === '\x7f') line = line.slice(0, -1);
    else if (ch >= ' ') line += ch;
  }
  return line === command || line.endsWith(` ${command}`);
}
function newNonce() {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createCommandLog() {
  const commands = [];
  const listeners = new Set();
  const nonce = newNonce();
  const marker = new RegExp(`⤷\\s+${nonce}\\s+(\\S+)\\s+▸\\s+([^\\n]+)`, 'g');
  let typed = '';
  let echoed = '';
  let pending = null;
  let esc = '';
  let secret = false;
  let current = null;
  let seq = 0;
  let runImpl = null;
  let sawReplay = false;
  const emit = () => { for (const fn of listeners) fn(); };
  function closeCurrent(at) {
    if (!current) return;
    current.endedAt = at;
    current.running = false;
    current = null;
  }
  function start(command, at, who) {
    const text = String(command || '').trim();
    if (!text) return;
    closeCurrent(at);
    current = {
      id: `cmd-${++seq}`, command: text, who: who || 'You', startedAt: at, endedAt: null,
      running: true, output: '', code: null, stopped: false, timedOut: false,
    };
    commands.push(current);
    if (commands.length > MAX_COMMANDS) commands.splice(0, commands.length - MAX_COMMANDS);
  }
  function absorb(text, at) {
    if (!text || !current?.running) return;
    current.output += text;
    if (current.output.length > MAX_OUTPUT) current.output = current.output.slice(-MAX_OUTPUT);
    if (endsWithPrompt(current.output)) closeCurrent(at);
  }
  function settle(text, at) {
    if (!pending) return;
    pending.buf += text;
    if (echoedBack(pending.buf, pending.command)) {
      const held = pending;
      pending = null;
      start(held.command, held.at, held.who);
      return;
    }
    if (pending.buf.includes('\n') || endsWithPrompt(pending.buf)) pending = null;
  }
  function watchPrompt(text) {
    const line = lastLine(text);
    if (!looksSecret(line)) {
      if (secret && endsWithPrompt(line)) secret = false;
      return;
    }
    secret = true;
    typed = '';
    echoed = '';
    pending = null;
    esc = '';
  }
  function stopRunning(at) {
    if (!current?.running) return;
    current.stopped = true;
    closeCurrent(at);
  }
  function take(ch, at, who) {
    if (secret) {
      if (ch === '\r' || ch === '\n' || ch === '\x03') {
        typed = '';
        echoed = '';
        esc = '';
        if (ch === '\x03') stopRunning(at);
        secret = false;
      }
      return;
    }
    if (esc) {
      const kind = esc;
      if (kind === 'e' && ch === '[') esc = 'c';
      else if (kind === 'e' && ch === ']') esc = 'o';
      else if (kind === 'e' && ch === 'O') esc = 's';
      else if (kind === 'o') { if (ch === BEL || ch === '\\') esc = ''; }
      else if (kind === 's' || ch >= '@') esc = '';
      return;
    }
    if (ch === ESC) { esc = 'e'; return; }
    if (ch === '\r' || ch === '\n') {
      const command = typed.trim();
      const buf = echoed;
      typed = '';
      echoed = '';
      if (!command) return;
      if (echoedBack(buf, command)) start(command, at, who);
      else pending = { command, at, who, buf: '' };
      return;
    }
    if (ch === '\x7f' || ch === '\b') { typed = typed.slice(0, -1); return; }
    if (ch === '\x15' || ch === '\x03') {
      typed = '';
      echoed = '';
      if (ch === '\x03') stopRunning(at);
      return;
    }
    if (ch >= ' ') typed += ch;
  }
  return {
    nonce,
    sawReplay: () => sawReplay,
    noteReplay() { sawReplay = true; emit(); },
    input(data, at = Date.now(), who = 'You') {
      for (const ch of String(data ?? '')) take(ch, at, who);
      emit();
    },
    output(data, at = Date.now()) {
      const text = clean(data);
      if (typed) echoed += text;
      settle(text, at);
      marker.lastIndex = 0;
      let cursor = 0;
      let match = marker.exec(text);
      if (!match) absorb(text, at);
      while (match) {
        absorb(text.slice(cursor, match.index), at);
        start(match[2].trim(), at, match[1].trim());
        cursor = match.index + match[0].length;
        match = marker.exec(text);
      }
      if (cursor) absorb(text.slice(cursor), at);
      watchPrompt(text);
      emit();
    },
    shellExited(code, at = Date.now()) {
      if (!current?.running) return;
      const number = Number(code) || 0;
      current.code = number;
      if (number !== 0) current.output += `\nProcess exited with code ${number}.`;
      closeCurrent(at);
      emit();
    },
    setRun(fn) { runImpl = fn; },
    run(command) {
      const text = String(command || '').trim();
      if (!text || !runImpl) return false;
      this.input(`${text}\r`);
      runImpl(text);
      return true;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    list() { return commands.map((command) => ({ ...command })); },
  };
}

const logs = new Map();
const workbenchOn = new Set();
const watchers = new Map();
const idOf = (sessionId) => String(sessionId || '');
const notify = (id) => { for (const fn of [...(watchers.get(id) || [])]) fn(); };

export function noteWorkbench(sessionId) { workbenchOn.add(idOf(sessionId)); }
export function mayRecord(sessionId) { return workbenchOn.has(idOf(sessionId)); }
export function peekSessionLog(sessionId) { return logs.get(idOf(sessionId)) || null; }
export function watchSessionLog(sessionId, fn) {
  const id = idOf(sessionId);
  if (!watchers.has(id)) watchers.set(id, new Set());
  watchers.get(id).add(fn);
  return () => watchers.get(id)?.delete(fn);
}
export function sessionLog(sessionId) {
  const id = idOf(sessionId);
  let log = logs.get(id);
  if (log) return log;
  log = createCommandLog();
  logs.set(id, log);
  notify(id);
  return log;
}
function record(sessionId, method, arg) {
  if (!mayRecord(sessionId)) return;
  sessionLog(sessionId)[method](arg);
}
export function recordInput(sessionId, data) { record(sessionId, 'input', data); }
export function recordOutput(sessionId, data) { record(sessionId, 'output', data); }
export function recordExit(sessionId, code) { record(sessionId, 'shellExited', code); }
export function noteReplay(sessionId) { sessionLog(sessionId).noteReplay(); }
export function sessionReplayed(sessionId) { return Boolean(logs.get(idOf(sessionId))?.sawReplay()); }
export function dropSessionLog(sessionId) {
  const id = idOf(sessionId);
  if (!logs.delete(id)) return;
  notify(id);
}
export function resetSessionLog(sessionId) {
  if (sessionId) { dropSessionLog(sessionId); return; }
  const ids = [...logs.keys()];
  logs.clear();
  workbenchOn.clear();
  for (const id of ids) notify(id);
}
