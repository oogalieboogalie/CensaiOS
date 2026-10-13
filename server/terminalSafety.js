// Catastrophic-command tripwire for the shared agent terminal.
//
// Isolated + framework-free (no node-pty / ws) so it is unit-testable on its
// own. This is a SEATBELT, not a sandbox: it blocks only a small set of
// unrecoverable, machine-wrecking commands so a hallucinated `rm -rf /` can't
// happen even in full-trust auto-run mode. Ordinary destructive-but-recoverable
// commands (deleting a folder, dropping a table, force-pushing a feature branch)
// still run — agents are trusted; this just removes the irreversible cliff.
//
// Disable entirely with HOMEBASE_TERMINAL_NO_TRIPWIRE=true.

const TRIPWIRE_DISABLED = process.env.HOMEBASE_TERMINAL_NO_TRIPWIRE === 'true';

// A recursive `rm` that targets an entire root/home tree (not a specific,
// recoverable path like ./dist or node_modules).
function rmNukesRoot(c) {
  if (!/\brm\b/i.test(c)) return false;
  const recursive = /(?:^|\s)-[a-z]*r[a-z]*(?=\s|$)/i.test(c) // -r, -rf, -fr, -R …
    || /--recursive\b/i.test(c)
    || /--no-preserve-root\b/i.test(c);
  if (!recursive) return false;
  if (/--no-preserve-root\b/i.test(c)) return true;
  // bare /, /*, ~, ~/, or $HOME as a target token (not /home/x or ./x)
  return /(?:^|\s)(?:~\/?|\/\*?|\$HOME)(?:\s|$)/.test(c);
}

export const CATASTROPHIC = [
  { why: 'recursive force-delete of / or ~', test: rmNukesRoot },
  { why: 'filesystem format', re: /\bmkfs(?:\.\w+)?\b/i },
  { why: 'raw write to a disk device', re: /\bdd\b[^\n]*\bof=\/dev\/(?:sd|nvme|hd|disk|vd)/i },
  { why: 'fork bomb', re: /:\s*\(\s*\)\s*\{[^}]*\|[^}]*&[^}]*\}\s*;?\s*:/ },
  { why: 'redirect over a disk device', re: />\s*\/dev\/(?:sd|nvme|hd|disk|vd)/i },
  { why: 'recursive chmod 000 on /', re: /\bchmod\s+-[a-z]*R[a-z]*\s+0{2,3}\s+\/(?:\s|$)/i },
  // power/shutdown only at command start or after a separator — so "reboot" in a
  // commit message or echo string is not a false positive.
  { why: 'host power/shutdown control', re: /(?:^|[;&|]\s*)(?:sudo\s+)?(?:shutdown|reboot|halt|poweroff)\b/i },
  // --force and main/master in any order on a git push line.
  { why: 'force-push to main/master', re: /\bgit\s+push\b(?=[^\n]*--force)(?=[^\n]*\b(?:main|master)\b)/i },
];

/** Returns the reason string if a command is catastrophically unsafe, else null. */
export function isCatastrophic(command) {
  if (TRIPWIRE_DISABLED) return null;
  const c = String(command || '');
  for (const entry of CATASTROPHIC) {
    const hit = entry.test ? entry.test(c) : entry.re.test(c);
    if (hit) return entry.why;
  }
  return null;
}
