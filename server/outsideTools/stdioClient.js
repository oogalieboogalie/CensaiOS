// server/outsideTools/stdioClient.js
//
// The client half of MCP's stdio transport: censaiOS starts an outside MCP
// server as a program on this computer and talks to it over its input and
// output, one JSON message per line. Only allowed where censaiOS may touch
// the local machine (desktop app, or a private server that opted in); the
// route checks that before a stdio server can be added.
//
// The program gets the same short environment the Agent Console gives coding
// CLIs (no database address, no session secret), plus the one key the user
// saved for it, in the variable they named. The server's shared settings
// (CENSAI_CLI_AGENT_ENV_PASS) go only to tools of someone allowed the
// computer's own keys (`serverKeys`, the same owner check as coding CLIs).

import { spawn } from 'node:child_process';
import { buildAgentEnv } from '../cli-agents/env.js';
import { CLIENT_INFO, CLIENT_PROTOCOL_VERSION, OutsideToolError, unwrapReply } from './httpClient.js';

const DEFAULT_TIMEOUT_MS = 30 * 1000;
const MAX_LINE_CHARS = 2 * 1024 * 1024;

/** How many shared settings CENSAI_CLI_AGENT_ENV_PASS would pass (names only, never values). */
export function sharedSettingCount(source = process.env) {
  return String(source.CENSAI_CLI_AGENT_ENV_PASS || '').split(',').map((s) => s.trim())
    .filter((s) => /^[A-Z][A-Z0-9_]{1,63}$/.test(s) && source[s] != null).length;
}

export function stdioEnv({ secret = '', secretEnv = '', source = process.env, serverKeys = false } = {}) {
  const env = buildAgentEnv({ source: serverKeys ? source : { ...source, CENSAI_CLI_AGENT_ENV_PASS: '' }, serverKeys });
  delete env.CI;
  delete env.CENSAI_AGENT_CONSOLE;
  if (secret && /^[A-Z][A-Z0-9_]{0,63}$/.test(secretEnv)) env[secretEnv] = secret;
  return env;
}

export function createStdioClient({
  command, args = [], secret = '', secretEnv = '', serverKeys = false, spawnImpl = spawn, timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  let child = null;
  let buffer = '';
  let stderrTail = '';
  let nextId = 1;
  const pending = new Map();

  function failAll(error) {
    for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(error); }
    pending.clear();
  }

  function handleLine(line) {
    if (!line.trim()) return;
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.method && 'id' in message) {
      // The server asks us something (ping, sampling, roots). Answer ping;
      // politely decline the rest.
      const reply = message.method === 'ping'
        ? { jsonrpc: '2.0', id: message.id, result: {} }
        : { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Not supported by censaiOS' } };
      child?.stdin.write(`${JSON.stringify(reply)}\n`);
      return;
    }
    const waiting = pending.get(message.id);
    if (!waiting) return;
    pending.delete(message.id);
    clearTimeout(waiting.timer);
    try { waiting.resolve(unwrapReply(message)); } catch (error) { waiting.reject(error); }
  }

  function start() {
    child = spawnImpl(command, args, {
      env: stdioEnv({ secret, secretEnv, serverKeys }),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      windowsHide: true,
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      if (buffer.length > MAX_LINE_CHARS) buffer = buffer.slice(-MAX_LINE_CHARS);
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        handleLine(line);
      }
    });
    child.stderr?.setEncoding?.('utf8');
    child.stderr?.on('data', (chunk) => { stderrTail = `${stderrTail}${chunk}`.slice(-2000); });
    child.on('error', (error) => {
      failAll(new OutsideToolError(`Could not start "${command}": ${error.message}`, 400));
      child = null;
    });
    child.on('exit', (code) => {
      const lines = stderrTail.trim().split('\n').map((l) => l.trim()).filter(Boolean);
      const tail = [...lines].reverse().find((l) => /error/i.test(l)) || lines.pop() || '';
      failAll(new OutsideToolError(`The tool program stopped (code ${code ?? '?'})${tail ? `: ${tail.slice(0, 200)}` : '.'}`));
      child = null;
    });
  }

  function send(message) {
    if (!child) throw new OutsideToolError('The tool program is not running.');
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  function request(method, params) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new OutsideToolError('The tool program took too long to answer.'));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try { send({ jsonrpc: '2.0', id, method, params }); } catch (error) {
        clearTimeout(timer); pending.delete(id); reject(error);
      }
    });
  }

  return {
    async connect() {
      start();
      const result = await request('initialize', {
        protocolVersion: CLIENT_PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO,
      });
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      return result;
    },
    request,
    close() {
      const running = child;
      child = null;
      failAll(new OutsideToolError('The tool program was closed.'));
      if (!running) return;
      try { running.stdin.end(); } catch { /* already closed */ }
      setTimeout(() => { try { running.kill(); } catch { /* gone */ } }, 1000).unref?.();
    },
  };
}
