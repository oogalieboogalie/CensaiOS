import os from 'os';

// Terminal log lines say what kind of folder a shell was opened in, never
// the folder itself: on a Windows PC the path holds the person's user name.
export function folderKind(cwd, hasProject = false, home = os.homedir()) {
  if (hasProject) return 'project';
  if (cwd && home && String(cwd).replace(/[\\/]+$/, '') === String(home).replace(/[\\/]+$/, '')) return 'home';
  return 'other';
}

// Start errors (node-pty, docker, wsl) often repeat the folder; drop any
// absolute path from the reason before it reaches the log.
const ABSOLUTE_PATH = /(?:[A-Za-z]:[\\/]|\\\\|\/)[^\s'"`,;)]*/g;

export function safeReason(err) {
  const text = String(err?.message || err || 'failed');
  return text.replace(ABSOLUTE_PATH, '<folder>').slice(0, 200);
}
