import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const EXCLUDED_NAMES = new Set([
  'JULES_TASK_TEMPLATE.md',
  'NEEDSUPDATED-ON-6-18-26_TOMORROW_QUEUE.md',
]);
const TERMINAL_STATUS = /\b(shipped|implemented|completed|complete|merged|closed|historical receipt|manually proved)\b/i;
const ACTIONABLE_STATUS = /\b(open|pending|contract-ready|ready|queued|unverified)\b/i;

function relative(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function field(text, name) {
  return text.match(new RegExp(`^${name}:\\s*(.+)$`, 'im'))?.[1]?.trim() || '';
}

function title(text, filePath) {
  return text.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(filePath, '.md');
}

function workText(text) {
  const match = /^## Work\s*$/im.exec(text);
  if (!match) return '';
  const afterHeading = text.slice(match.index + match[0].length).replace(/^\r?\n/, '');
  const nextHeading = /^##\s/m.exec(afterHeading);
  return (nextHeading ? afterHeading.slice(0, nextHeading.index) : afterHeading).trim();
}

function fingerprint(text, filePath) {
  const source = workText(text) || title(text, filePath);
  const normalized = source.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function needsSplit(text) {
  return /execute as sequential narrow slices|each numbered block as a separate task|separate task and pr|master .*plan/i.test(text);
}

export function classifyHandoff({ filePath, text, stat, repoRoot }) {
  const name = path.basename(filePath);
  if (EXCLUDED_NAMES.has(name)) return null;
  const statusText = field(text, 'Status');
  const hasHandoffShape = /^Project:\s*.+$/im.test(text) && /^## Work\s*$/im.test(text);
  const explicitlyActionable = ACTIONABLE_STATUS.test(statusText);
  if (!explicitlyActionable && TERMINAL_STATUS.test(statusText)) return null;
  if (!explicitlyActionable && !hasHandoffShape) return null;
  const splitRequired = needsSplit(text);
  return {
    brief: relative(repoRoot, filePath),
    title: title(text, filePath),
    status: splitRequired ? 'needs_split' : 'pending',
    source: 'handoff-directory',
    priority: field(text, 'Priority') || 'normal',
    assignee: field(text, 'Assignee') || null,
    handoffStatus: statusText || 'open',
    discoveredAt: stat.mtime.toISOString(),
    fingerprint: fingerprint(text, filePath),
    dispatchable: !splitRequired,
    reason: splitRequired ? 'Master plan must be split into one brief per PR before dispatch.' : null,
  };
}

export async function discoverHandoffTasks({
  repoRoot = process.cwd(),
  handoffDir = path.resolve(repoRoot, '.team', 'handoffs'),
} = {}) {
  const dirEntries = await fs.readdir(handoffDir, { withFileTypes: true });
  const tasks = [];
  for (const entry of dirEntries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const filePath = path.join(handoffDir, entry.name);
    const [text, stat] = await Promise.all([fs.readFile(filePath, 'utf8'), fs.stat(filePath)]);
    const task = classifyHandoff({ filePath, text, stat, repoRoot });
    if (task) tasks.push(task);
  }
  const ordered = tasks.sort((a, b) => {
    const rank = value => {
      const normalized = String(value || '').trim();
      const match = normalized.match(/^(P[0-2]|critical|high|normal|low)\b/i)?.[1] || normalized;
      const key = /^p[0-2]$/i.test(match) ? match.toUpperCase() : match.toLowerCase();
      return ({ P0: 4, critical: 4, high: 3, P1: 3, normal: 2, P2: 2, low: 1 }[key] || 0);
    };
    return rank(b.priority) - rank(a.priority) || a.brief.localeCompare(b.brief);
  });
  const canonical = new Map();
  for (const task of ordered) {
    const existing = canonical.get(task.fingerprint);
    if (existing) {
      existing.duplicateBriefs = [...(existing.duplicateBriefs || []), task.brief];
    } else {
      canonical.set(task.fingerprint, task);
    }
  }
  return [...canonical.values()];
}

export function reconcileDiscoveredTasks(queue = {}, discovered = []) {
  const tracked = new Set(
    ['inflight', 'blocked', 'dispatched']
      .flatMap(key => Array.isArray(queue[key]) ? queue[key] : [])
      .map(entry => typeof entry === 'string' ? entry : entry?.brief)
      .filter(Boolean)
  );
  const existing = new Map(
    (Array.isArray(queue.pending) ? queue.pending : [])
      .map(entry => [typeof entry === 'string' ? entry : entry?.brief, entry])
      .filter(([brief]) => brief)
  );
  return discovered
    .filter(task => !tracked.has(task.brief))
    .map(task => ({ ...task, ...(typeof existing.get(task.brief) === 'object' ? existing.get(task.brief) : {}) }));
}
