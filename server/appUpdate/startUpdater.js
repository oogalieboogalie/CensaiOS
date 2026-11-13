/**
 * Start the hidden Windows updater from this PC.
 * Inside Docker this is Linux, so it cannot start the updater; the
 * desktop app or the sign-in link does that instead.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { selfRepo } from '../selfFix/patches.js';

export function updaterScript(repo) {
  if (!repo) return null;
  const script = path.join(repo, 'scripts', 'auto-update.ps1');
  return fs.existsSync(script) ? script : null;
}

/**
 * { started: true } when a hidden updater was started on Windows.
 * { started: false } everywhere else, including this server running in Docker.
 */
export function startUpdaterProcess({
  platform = process.platform,
  repo = selfRepo(),
  spawnFn = spawn,
  script = updaterScript(repo),
} = {}) {
  if (platform !== 'win32' || !script) return { started: false };
  const child = spawnFn('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script,
  ], {
    cwd: path.dirname(path.dirname(script)),
    windowsHide: true,
    detached: true,
    stdio: 'ignore',
  });
  child.unref?.();
  return { started: true };
}
