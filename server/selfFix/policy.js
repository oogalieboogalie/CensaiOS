import path from 'path';

/**
 * Self-fix runs with nobody watching, so nobody is asked to click Allow.
 * Instead this policy answers Claude Code's permission questions itself:
 *
 *   reading and searching        allowed
 *   editing files                allowed inside the fix's own worktree only,
 *                                never .env, .git or node_modules
 *   commands                     only read-only looks and the test runner
 *   internet, installs, anything else   denied, with a reason the agent reads
 */

const READ_TOOLS = new Set(['Read', 'NotebookRead', 'Grep', 'Glob', 'LS', 'TodoWrite', 'BashOutput']);
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
const BLOCKED_PATHS = /(^|[\\/])(\.env(\.[^\\/]*)?|\.git|node_modules)([\\/]|$)/;

const SAFE_COMMANDS = [
  /^npm (run )?test(\s|$)/,
  /^npm run (lint|size:check|window:validate)(\s|$)/,
  /^npx (jest|eslint)\s/,
  /^node --experimental-vm-modules node_modules\/jest\/bin\/jest\.js(\s|$)/,
  /^node --check\s/,
  /^git (status|diff|log|show|grep|blame)(\s|$)/,
  /^(ls|cat|head|tail|grep|rg|find|wc|pwd|echo)(\s|$)/,
  /^sed -n\s/,
];

function inside(dir, file) {
  if (!file) return false;
  const target = path.resolve(dir, String(file));
  return target === dir || target.startsWith(dir + path.sep);
}

/** Every piece of a command line must be a safe command; no subshells or writes. */
export function isSafeCommand(command) {
  const text = String(command || '').trim();
  if (!text || /[`]|\$\(|<\(|>\(/.test(text)) return false;
  if (/\s-(delete|exec|execdir|ok|fprint)\b|\s--output\b|\bsed\s+(-\w*i|--in-place)/.test(text)) return false;
  if (/(^|[^0-9&])>{1,2}(?!&1)/.test(text.replace(/2>&1|2>\/dev\/null/g, ''))) return false;
  const parts = text.split(/\s*(?:&&|\|\||;|\|)\s*/).filter(Boolean);
  const cd = /^cd\s+\S+$/;
  return parts.every((part) => cd.test(part) || SAFE_COMMANDS.some((re) => re.test(part)));
}

/** Decide one permission request: { allow, message }. */
export function decidePermission(request, worktreeDir) {
  const tool = String(request?.tool || '');
  const input = request?.input || {};
  const dir = path.resolve(worktreeDir);
  const file = input.file_path || input.notebook_path || input.path || null;

  if (READ_TOOLS.has(tool)) {
    if (file && !inside(dir, file)) return { allow: false, message: 'A self-fix run can only read files in its own copy of censaiOS.' };
    return { allow: true };
  }
  if (EDIT_TOOLS.has(tool)) {
    if (!inside(dir, file)) return { allow: false, message: 'A self-fix run can only edit files in its own copy of censaiOS.' };
    if (BLOCKED_PATHS.test(path.relative(dir, path.resolve(dir, file)))) {
      return { allow: false, message: 'Do not touch .env, .git or node_modules. Fix the code instead.' };
    }
    return { allow: true };
  }
  if (tool === 'Bash') {
    if (isSafeCommand(input.command)) return { allow: true };
    return {
      allow: false,
      message: 'In a self-fix run only read-only commands and the test runner are allowed '
        + '(for example: node --experimental-vm-modules node_modules/jest/bin/jest.js tests/x.test.js). No installs, no network, no git commits.',
    };
  }
  if (tool === 'WebFetch' || tool === 'WebSearch') {
    return { allow: false, message: 'A self-fix run has no internet. Work from the code and the error report.' };
  }
  return { allow: false, message: `${tool || 'That tool'} is not available in a self-fix run.` };
}
