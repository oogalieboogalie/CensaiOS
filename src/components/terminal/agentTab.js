// Who is in one terminal tab. A plain shell is the person at the keyboard.
// A coding tool uses the mark the app already has. A prompted run starts
// OpenCode, so that tab says OpenCode rather than whichever tool opened it.

import { AGENT_HOTKEY_ACTIONS } from '../../lib/agentHotkeys.js';
import { CLI_BRAND, brandFor } from '../../lib/brands/index.js';
import { WORKBENCH_MARK_PATHS } from './workbenchMarks.js';

const NAME = {
  claudecode: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
  opencode: 'OpenCode',
  copilot: 'Copilot',
  grok: 'Grok',
};

// The first sentence, short enough to sit under an orb.
export function oneSentence(text, max = 80) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const first = flat.split(/(?<=[.!?])\s/)[0];
  const sentence = first.length <= max ? first : flat;
  if (sentence.length <= max) return sentence;
  return `${sentence.slice(0, max - 1).trimEnd()}...`;
}

// The tool actually started in this tab. Extra tabs are plain shells.
// A prompted run on the first tab starts OpenCode.
function cliInTab(win, tab) {
  if (tab.id === 'main' && win.agentRun?.prompt) return 'opencode';
  if (tab.cli) return tab.cli;
  if (tab.id === 'main' && win.launchCli) return win.launchCli;
  return null;
}

function markFor(cli) {
  const key = CLI_BRAND[cli];
  if (!key) return null;
  const record = brandFor(key);
  const path = record?.path || WORKBENCH_MARK_PATHS[key];
  if (!path) return null;
  return { key, title: NAME[cli] || record?.title || key, path };
}

export function agentForTab(win = {}, tab = {}) {
  const cli = cliInTab(win, tab);
  const live = tab.live !== false;
  const busy = live && tab.id === 'main' && Boolean(win.agentRun?.prompt);
  const known = AGENT_HOTKEY_ACTIONS.find((action) => action.cli === cli);
  const name = cli ? (NAME[cli] || known?.label || String(cli)) : 'You';
  let detail = 'No agent';
  if (!live) detail = 'Not started';
  else if (busy) detail = oneSentence(win.agentRun.prompt) || 'Working';
  else if (cli) detail = 'Idle';
  return {
    name,
    detail,
    live,
    status: live ? (busy ? 'busy' : 'idle') : null,
    mark: markFor(cli),
    you: !cli,
  };
}
