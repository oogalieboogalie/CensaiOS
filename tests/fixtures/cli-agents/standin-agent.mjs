#!/usr/bin/env node
/**
 * Stand-in coding CLI for Agent Console tests and demos.
 *
 * It speaks the same headless protocols the adapters parse, without a
 * model: Claude Code stream-json (with stdio permission prompts), Codex
 * `exec --json`, and Gemini CLI stream-json. The mode comes from the argv
 * the adapter builds. What it "does" is a script of steps, read from the
 * JSON file in STANDIN_SCRIPT, or a small default that works in any repo.
 * File writes and commands are real, so the worktree diff is real.
 *
 * Step shapes: { say }, { think }, { read }, { write, content },
 * { edit, old, new }, { bash }.
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { execSync } from 'child_process';

const argv = process.argv.slice(2);
if (argv.includes('--version')) {
  process.stdout.write('9.9.9 (stand-in)\n');
  process.exit(0);
}

const mode = argv.includes('exec') ? 'codex' : argv.includes('--approval-mode') ? 'gemini' : 'claude';
const resumeIdx = argv.indexOf(mode === 'codex' ? 'resume' : '--resume');
const sessionId = resumeIdx >= 0 ? argv[resumeIdx + 1] : `standin-${process.pid}-${Date.now().toString(36)}`;
const delay = Number(process.env.STANDIN_DELAY_MS || 120);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);

const DEFAULT_STEPS = [
  { think: 'Look around before changing anything.' },
  { say: 'I will read the README, add a short notes file, and check git status.' },
  { read: 'README.md' },
  { write: 'AGENT_NOTES.md', content: '# Notes\n\nAdded by the stand-in agent.\n' },
  { bash: 'git status --short' },
  { say: 'Done: added AGENT_NOTES.md.' },
];

function loadSteps(task) {
  const file = process.env.STANDIN_SCRIPT;
  if (!file) return DEFAULT_STEPS;
  const script = JSON.parse(fs.readFileSync(file, 'utf8'));
  // A script can branch on words in the task: { match: { "review": [...] }, default: [...] }
  if (Array.isArray(script)) return script;
  const lower = String(task || '').toLowerCase();
  for (const [word, steps] of Object.entries(script.match || {})) {
    if (lower.includes(word.toLowerCase())) return steps;
  }
  return script.default || DEFAULT_STEPS;
}

function readSafe(rel) {
  try { return fs.readFileSync(path.resolve(rel), 'utf8'); } catch { return `(no ${rel})`; }
}

function applyStep(step) {
  if (step.write) {
    fs.mkdirSync(path.dirname(path.resolve(step.write)), { recursive: true });
    fs.writeFileSync(path.resolve(step.write), step.content || '');
    return `Wrote ${step.write}`;
  }
  if (step.edit) {
    const file = path.resolve(step.edit);
    const before = fs.readFileSync(file, 'utf8');
    if (!before.includes(step.old)) throw new Error(`old_string not found in ${step.edit}`);
    fs.writeFileSync(file, before.replace(step.old, step.new));
    return `Updated ${step.edit}`;
  }
  if (step.bash) {
    try {
      return execSync(step.bash, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) || '(no output)';
    } catch (err) {
      return String(err.stdout || '') + String(err.stderr || err.message);
    }
  }
  return '';
}

// ── stdin: first line (or all of it) is the task; later lines are answers ──
const rl = readline.createInterface({ input: process.stdin });
const waiting = new Map();
let firstLine = null;
const firstLineReady = new Promise((resolve) => { firstLine = resolve; });
let stdinText = '';
rl.on('line', (line) => {
  stdinText += `${line}\n`;
  if (mode === 'claude') {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.type === 'user') firstLine(msg.message?.content?.[0]?.text || msg.message?.content || '');
    if (msg.type === 'control_response') {
      const id = msg.response?.request_id;
      waiting.get(id)?.(msg.response?.response || {});
      waiting.delete(id);
    }
  }
});
rl.on('close', () => { if (mode !== 'claude') firstLine(stdinText.trim()); });

let reqCount = 0;
function askPermission(toolName, input, toolUseId) {
  const requestId = `req-${++reqCount}`;
  out({ type: 'control_request', request_id: requestId, request: { subtype: 'can_use_tool', tool_name: toolName, input, tool_use_id: toolUseId } });
  return new Promise((resolve) => waiting.set(requestId, resolve));
}

async function runClaude(task, steps) {
  out({ type: 'system', subtype: 'init', session_id: sessionId, model: 'stand-in', cwd: process.cwd(), tools: ['Read', 'Write', 'Edit', 'Bash'] });
  let n = 0;
  for (const step of steps) {
    await sleep(delay);
    const id = `toolu_${++n}`;
    if (step.say) { out({ type: 'assistant', session_id: sessionId, message: { id: `msg_${n}`, content: [{ type: 'text', text: step.say }] } }); continue; }
    if (step.think) { out({ type: 'assistant', session_id: sessionId, message: { id: `msg_${n}`, content: [{ type: 'thinking', thinking: step.think }] } }); continue; }
    let name; let input;
    if (step.read) { name = 'Read'; input = { file_path: path.resolve(step.read) }; }
    else if (step.write) { name = 'Write'; input = { file_path: path.resolve(step.write), content: step.content || '' }; }
    else if (step.edit) { name = 'Edit'; input = { file_path: path.resolve(step.edit), old_string: step.old, new_string: step.new }; }
    else if (step.bash) { name = 'Bash'; input = { command: step.bash, description: step.description || 'Run a command' }; }
    else continue;
    out({ type: 'assistant', session_id: sessionId, message: { id: `msg_${n}`, content: [{ type: 'tool_use', id, name, input }] } });
    let content;
    let isError = false;
    if (name === 'Read') {
      content = readSafe(step.read).split('\n').slice(0, 40).join('\n');
    } else {
      const answer = await askPermission(name, input, id);
      if (answer.behavior !== 'allow') { content = answer.message || 'Permission denied'; isError = true; }
      else {
        try { content = applyStep(step); } catch (err) { content = err.message; isError = true; }
      }
    }
    await sleep(delay);
    out({ type: 'user', session_id: sessionId, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] } });
  }
  const summary = [...steps].reverse().find((s) => s.say)?.say || 'Done.';
  out({ type: 'result', subtype: 'success', is_error: false, result: summary, session_id: sessionId, total_cost_usd: 0.0123, duration_ms: 1800, num_turns: steps.length, usage: { input_tokens: 2400, output_tokens: 610 } });
}

async function runCodex(task, steps) {
  out({ type: 'thread.started', thread_id: sessionId });
  out({ type: 'turn.started' });
  let n = 0;
  for (const step of steps) {
    await sleep(delay);
    const id = `item_${n++}`;
    if (step.say) { out({ type: 'item.completed', item: { id, type: 'agent_message', text: step.say } }); continue; }
    if (step.think) { out({ type: 'item.completed', item: { id, type: 'reasoning', text: step.think } }); continue; }
    if (step.read) {
      const command = `sed -n '1,40p' ${step.read}`;
      out({ type: 'item.started', item: { id, type: 'command_execution', command, aggregated_output: '', status: 'in_progress' } });
      await sleep(delay);
      out({ type: 'item.completed', item: { id, type: 'command_execution', command, aggregated_output: readSafe(step.read).split('\n').slice(0, 40).join('\n'), exit_code: 0, status: 'completed' } });
      continue;
    }
    if (step.bash) {
      out({ type: 'item.started', item: { id, type: 'command_execution', command: step.bash, aggregated_output: '', status: 'in_progress' } });
      const output = applyStep(step);
      await sleep(delay);
      out({ type: 'item.completed', item: { id, type: 'command_execution', command: step.bash, aggregated_output: output, exit_code: 0, status: 'completed' } });
      continue;
    }
    if (step.write || step.edit) {
      const existed = fs.existsSync(path.resolve(step.write || step.edit));
      applyStep(step);
      out({ type: 'item.completed', item: { id, type: 'file_change', changes: [{ path: step.write || step.edit, kind: existed ? 'update' : 'add' }], status: 'completed' } });
    }
  }
  out({ type: 'turn.completed', usage: { input_tokens: 3100, cached_input_tokens: 0, output_tokens: 420 } });
}

async function runGemini(task, steps) {
  out({ type: 'init', session_id: sessionId, model: 'stand-in' });
  let n = 0;
  for (const step of steps) {
    await sleep(delay);
    const id = `tool_${n++}`;
    if (step.say) { out({ type: 'message', role: 'assistant', content: step.say, delta: false }); continue; }
    if (step.read) {
      out({ type: 'tool_use', tool_name: 'read_file', tool_id: id, parameters: { absolute_path: path.resolve(step.read) } });
      out({ type: 'tool_result', tool_id: id, status: 'success', output: readSafe(step.read).slice(0, 400) });
      continue;
    }
    if (step.write) {
      out({ type: 'tool_use', tool_name: 'write_file', tool_id: id, parameters: { file_path: path.resolve(step.write), content: step.content } });
      out({ type: 'tool_result', tool_id: id, status: 'success', output: applyStep(step) });
    }
  }
  out({ type: 'result', status: 'success', stats: { total_tokens: 900, input_tokens: 700, output_tokens: 200, duration_ms: 900, tool_calls: n } });
}

const task = await firstLineReady;
const steps = loadSteps(task);
if (process.env.STANDIN_FAIL) {
  process.stderr.write('stand-in: simulated failure\n');
  process.exit(3);
}
if (mode === 'claude') await runClaude(task, steps);
else if (mode === 'codex') await runCodex(task, steps);
else await runGemini(task, steps);
rl.close();
process.stdin.destroy();
