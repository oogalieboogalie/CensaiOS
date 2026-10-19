import os from 'os';
import path from 'path';
import { baseName, clip, resultText } from './shared.js';
import { agentHome } from '../paths.js';

/**
 * Grok Build CLI (xAI) in headless mode:
 *   grok -p <task> --output-format streaming-json --always-approve [-r <session>] [-m <model>]
 *
 * Grok takes the task as an argument, so it is passed as one argv element and
 * never through a shell. Headless Grok cannot stop and ask (approvals need its
 * ACP mode), so --always-approve lets it edit inside the task's worktree; the
 * person's own Grok deny rules still apply. It runs on the person's own Grok
 * sign-in (a SuperGrok or Grok Heavy plan) or XAI_API_KEY. Each censaiOS person
 * has their own GROK_HOME (personalHome.js), so one person's sign-in is never
 * another's.
 *
 * streaming-json events (docs.x.ai/build/cli/headless-scripting): text {data},
 * thought {data}, tool_call {toolCallId,title,kind,status,toolName,rawInput},
 * tool_call_update {toolCallId,status,rawOutput}, end {stopReason,sessionId,
 * usage,modelUsage}, error {message}. `end` is always last.
 */

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const KIND = { read: 'read', edit: 'edit', delete: 'edit', move: 'edit', search: 'search', execute: 'command', fetch: 'search' };

function stepStatus(status) {
  if (status === 'failed' || status === 'error') return 'error';
  if (status === 'completed' || status === 'done') return 'ok';
  return 'running';
}

function costOf(modelUsage) {
  if (!modelUsage || typeof modelUsage !== 'object') return undefined;
  const total = Object.values(modelUsage).reduce((sum, m) => sum + (Number(m?.costUSD) || 0), 0);
  return total > 0 ? total : undefined;
}

export const grok = {
  id: 'grok',
  label: 'Grok',
  vendor: 'xAI',
  binary: 'grok',
  // Not on npm: xAI ships it with its own installer (x.ai/cli, install.js).
  npmPackage: null,
  installScript: {
    posix: 'curl -fsSL https://x.ai/cli/install.sh | bash',
    windows: 'irm https://x.ai/cli/install.ps1 | iex',
  },
  installHint: 'Install Grok from https://x.ai/cli, sign in once with `grok`, then try again.',
  keyEnv: 'XAI_API_KEY',
  vaultProvider: 'xai',
  loginFiles: ['.grok/auth.json', '.grok/credentials.json'],
  // Each person's own sign-in, in their own folder (see personalHome.js).
  personalHome: { env: 'GROK_HOME', loginFile: 'auth.json', extraEnv: { GROK_DISABLE_AUTOUPDATER: '1' } },
  // No browser inside Docker: xAI's device-code sign-in prints a link and a code.
  loginArgs: ['login', '--device-auth'],
  // Where xAI's installer leaves grok when it is not on PATH.
  installedAt(env = process.env) {
    const exe = process.platform === 'win32' ? 'grok.exe' : 'grok';
    const homes = [...new Set([agentHome(env), env.HOME, env.USERPROFILE, os.homedir()].filter(Boolean))];
    return homes.flatMap((home) => [path.join(home, '.grok', 'bin', exe), path.join(home, '.local', 'bin', exe)]);
  },
  homepage: 'https://x.ai/cli',
  gate: 'auto-edit',
  gateNote: 'Edits files in its worktree on its own; your Grok deny rules still apply.',
  taskInArgs: true,

  // Read-only (reviews): only the read tools from xAI's headless docs, so a
  // PR's text cannot talk it into running commands or editing files.
  buildRun({ task, resumeSessionId, model, readOnly = false }) {
    const args = ['-p', task, '--output-format', 'streaming-json', ...(readOnly ? ['--tools', 'read_file,grep,list_dir'] : ['--always-approve'])];
    if (resumeSessionId && SAFE_ID.test(resumeSessionId)) args.push('-r', resumeSessionId);
    if (model && SAFE_ID.test(model)) args.push('-m', model);
    return { args, stdin: [], keepStdinOpen: false };
  },

  createParser() {
    // Text arrives in pieces; each assistant turn between tool calls is one message.
    const stamp = Date.now().toString(36);
    let msgCount = 0;
    let current = null;
    let thoughtCount = 0;
    return function parse(event) {
      if (!event || typeof event !== 'object') return [];
      switch (event.type) {
        case 'text': {
          const data = typeof event.data === 'string' ? event.data : '';
          if (!data) return [];
          if (current) return [{ op: 'append', id: current, text: data }];
          msgCount += 1;
          current = `grok-${stamp}-m${msgCount}`;
          return [{ op: 'add', item: { id: current, kind: 'message', role: 'assistant', text: data } }];
        }
        case 'thought': {
          const data = typeof event.data === 'string' ? event.data.trim() : '';
          thoughtCount += 1;
          return data ? [{ op: 'add', item: { id: `grok-${stamp}-t${thoughtCount}`, kind: 'thinking', text: clip(data, 4000) } }] : [];
        }
        case 'tool_call': {
          current = null;
          const kind = KIND[event.kind] || 'tool';
          const input = event.rawInput && typeof event.rawInput === 'object' ? event.rawInput : {};
          const where = event.locations?.[0]?.path || input.path || input.file_path || '';
          return [{ op: 'upsert', item: {
            id: `grok-${event.toolCallId}`, kind, tool: event.toolName || event.kind || 'tool',
            title: event.title || (where ? `${kind === 'read' ? 'Read' : 'Use'} ${baseName(where)}` : 'Use a tool'),
            path: where, command: kind === 'command' ? String(input.command || '') : undefined,
            status: stepStatus(event.status),
          } }];
        }
        case 'tool_call_update':
          return [{ op: 'update', id: `grok-${event.toolCallId}`, patch: {
            status: stepStatus(event.status),
            ...(event.rawOutput != null ? { output: clip(resultText(event.rawOutput)) } : {}),
          } }];
        case 'end':
          return [
            { op: 'meta', patch: {
              sessionId: event.sessionId || null,
              usage: event.usage ? { input: event.usage.input_tokens, output: event.usage.output_tokens } : undefined,
              costUsd: costOf(event.modelUsage),
            } },
            { op: 'done', ok: event.stopReason !== 'error', summary: null },
          ];
        case 'error':
          return [
            { op: 'add', item: { id: `grok-${stamp}-err`, kind: 'error', text: event.message || 'Grok reported an error.' } },
            { op: 'done', ok: false, summary: event.message || 'Grok stopped with an error.' },
          ];
        default:
          return [];
      }
    };
  },
};
