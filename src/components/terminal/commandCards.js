// Plain words for one command that already ran. The real command stays
// beside the title; this only decides the sentence a person reads.

import { CLI_BRAND, brandFor } from '../../lib/brands/index.js';
import { COMMAND_MARK_PATHS } from './commandMarks.js';

const NAMES = {
  claudecode: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
  opencode: 'OpenCode',
  copilot: 'Copilot',
  grok: 'Grok',
};

const BY_NAME = Object.fromEntries(Object.entries(NAMES).map(([cli, name]) => [name.toLowerCase(), cli]));

function oneSentence(text, max = 90) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const first = flat.split(/(?<=[.!?])\s/)[0];
  const sentence = first.length <= max ? first : flat;
  if (sentence.length <= max) return sentence;
  return `${sentence.slice(0, max - 1).trimEnd()}...`;
}

export function changesOutsideThisComputer(command) {
  const line = String(command || '').trim();
  if (!line) return false;
  if (/\b(git\s+push|npm\s+publish|pnpm\s+publish|yarn\s+publish|docker\s+push)\b/i.test(line)) return true;
  return /(?:^|[;&|]\s*)(?:[\w.-]+\s+)*deploy\b/i.test(line);
}

export function tookLabel(ms, running) {
  if (running) return 'still going';
  if (ms == null || Number.isNaN(ms)) return '';
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 1) return 'under a second';
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? '1 min' : `${minutes} min`;
}

function looksFailed(output) {
  const text = String(output || '');
  if (/eaddrinuse/i.test(text)) return true;
  if (/\bcommand not found\b/i.test(text)) return true;
  if (/\bFAIL\b/.test(text)) return true;
  if (/\b([1-9]\d*) failed\b/i.test(text)) return true;
  if (/\berror[:\s]/i.test(text) && !/\b0 errors?\b/i.test(text)) return true;
  return false;
}

function usefulLine(output, command) {
  const lines = String(output || '').split('\n').map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (line === command) continue;
    if (/^[^\n]{0,120}[$#%>]\s*$/.test(line)) continue;
    if (/^⤷\s+/.test(line)) continue;
    if (/^process exited with code\b/i.test(line)) continue;
    return oneSentence(line);
  }
  return '';
}

function titleFor(command, { running, failed, outside }) {
  const rules = [
    [/^(npm|pnpm|yarn)\s+(run\s+)?test\b/, ['Running the checks', 'The checks failed', 'Ran the checks']],
    [/^(npm|pnpm|yarn)\s+(run\s+)?dev\b|^(npm|pnpm|yarn)\s+start\b/, ['Starting the app', 'Tried to start the app', 'Started the app']],
    [/^git\s+pull\b/, ['Getting the latest code', 'Could not get the latest code', 'Got the latest code']],
    [/^git\s+commit\b/, ['Saving the changes', 'Could not save the changes', 'Saved the changes']],
    [/^(npm|pnpm|yarn)\s+(install|ci)\b/, ['Installing what it needs', 'Could not install what it needs', 'Installed what it needs']],
    [/^git\s+status\b/, ['Checking what changed', 'Could not check what changed', 'Checked what changed']],
    [/^git\s+push\b/, ['Sending the changes up', 'Could not send the changes up', 'Sent the changes up']],
    [/^(npm|pnpm|yarn)\s+publish\b/, ['Publishing the package', 'Could not publish the package', 'Published the package']],
    [/\bdeploy\b/, ['Deploying', 'Could not deploy', 'Deployed']],
  ];
  const hit = rules.find(([pattern]) => pattern.test(command));
  if (hit) return hit[1][running ? 0 : failed ? 1 : 2];
  if (outside) return running ? 'Changing something outside this computer' : failed ? 'Could not change anything outside this computer' : 'Changed something outside this computer';
  if (running) return 'Running a command';
  if (failed) return 'The command failed';
  return 'Ran a command';
}

function sentenceFor(record, { running, failed, outside }) {
  if (record.stopped) return 'It was stopped before it finished.';
  if (record.timedOut) return 'It ran out of time.';
  if (/eaddrinuse/i.test(record.output || '')) return 'It did not start. Something else is already using that port.';
  if (running) return 'It is still running.';
  const line = usefulLine(record.output, record.command);
  if (line) return /[.!?]$/.test(line) ? line : `${line}.`;
  if (outside && !failed) return 'This changed things outside this computer.';
  if (failed) return 'It did not finish.';
  return 'It finished.';
}

function markForWho(who) {
  const cli = BY_NAME[String(who || '').trim().toLowerCase()];
  if (!cli) return null;
  const key = CLI_BRAND[cli];
  if (!key) return null;
  const record = brandFor(key);
  const path = record?.path || COMMAND_MARK_PATHS[key];
  if (!path) return null;
  return { key, title: NAMES[cli] || who, path };
}

export function presentCommand(record, now = Date.now()) {
  const command = String(record?.command || '').trim();
  const running = Boolean(record?.running);
  const failed = !running && !record?.stopped && (
    record?.timedOut
    || (record?.code != null && record.code !== 0)
    || looksFailed(record?.output)
  );
  const outside = changesOutsideThisComputer(command);
  const started = record?.startedAt ?? now;
  const ended = record?.endedAt;
  const who = record?.who || 'You';
  return {
    id: record?.id || command,
    title: titleFor(command, { running, failed, outside }),
    command,
    sentence: sentenceFor(record || {}, { running, failed, outside }),
    status: running ? 'run' : failed ? 'bad' : 'ok',
    took: tookLabel(ended != null ? ended - started : now - started, running),
    who,
    you: who.toLowerCase() === 'you',
    mark: markForWho(who),
    output: String(record?.output || '').trim(),
    outside,
    running,
  };
}

export function presentCommands(records, now = Date.now()) {
  return [...(records || [])].reverse().map((record) => presentCommand(record, now));
}
