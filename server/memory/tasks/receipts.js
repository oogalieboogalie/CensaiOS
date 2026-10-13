import pool from '../../db.js';

export const TERMINAL_TASK_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const RECEIPT_MAX_ITEMS = 5;
const RECEIPT_MAX_CHARS = 260;

export async function ensureAgentTaskReceiptSchema() {
  await pool.query(`
    ALTER TABLE agent_tasks
      ADD COLUMN IF NOT EXISTS completion_receipt JSONB
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_agent_tasks_receipts ON agent_tasks(completed_at DESC) WHERE completion_receipt IS NOT NULL');
}

function compactLine(value, max = RECEIPT_MAX_CHARS) {
  const line = String(value || '')
    .replace(/\r/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[-*]\s*/, '')
    .trim();
  return line.length > max ? `${line.slice(0, max - 3)}...` : line;
}

function uniqueItems(items = [], max = RECEIPT_MAX_ITEMS) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const clean = compactLine(item);
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    out.push(clean);
    if (out.length >= max) break;
  }
  return out;
}

function extractSection(text, names = []) {
  const source = String(text || '').replace(/\r/g, '');
  if (!source.trim()) return '';
  const namePattern = names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`^#{1,6}\\s*(?:${namePattern})\\s*$`, 'im');
  const match = source.match(re);
  if (!match) return '';
  const start = (match.index || 0) + match[0].length;
  const rest = source.slice(start);
  const next = rest.search(/^#{1,6}\s+\S.*$/m);
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}

function sectionItems(text) {
  return uniqueItems(String(text || '')
    .split('\n')
    .map(line => line.replace(/^[-*]\s+/, '').trim())
    .filter(line => line && !/^#{1,6}\s+/.test(line)));
}

function extractPaths(...values) {
  const text = values.map(value => String(value || '')).join('\n');
  const matches = text.match(/(?:[A-Za-z]:\\[^\s`"'<>|]+|(?:\.{1,2}\/|\.team\/|src\/|server\/|docker\/|tests\/|tools\/|docs\/)[^\s`"'<>|]+)/g) || [];
  return uniqueItems(matches.map(item => item.replace(/[),.;:]+$/, '')), 6);
}

function extractHandoffPath(prompt) {
  const match = String(prompt || '').match(/Handoff file:\s*(.+)/i);
  return match ? compactLine(match[1], 500) : null;
}

export function buildCompletionReceipt(task = {}, patch = {}) {
  const status = patch.status || task.status;
  if (!TERMINAL_TASK_STATUSES.has(status)) return null;

  const result = String(patch.result ?? task.result ?? '').trim();
  const error = String(patch.error ?? task.error ?? '').trim();
  const body = error || result;
  const summarySection = extractSection(body, ['Summary of Changes', 'Summary', 'What Changed', 'Changes']);
  const verificationSection = extractSection(body, ['Verification Steps', 'Verification', 'What to Verify', 'Verify']);
  const landedSection = extractSection(body, ['Where It Landed', 'Files Changed', 'Changed Files', 'Landing']);
  const fallbackLines = sectionItems(body).slice(0, 3);
  const handoffPath = extractHandoffPath(task.prompt);
  const landed = uniqueItems([
    handoffPath ? `Handoff: ${handoffPath}` : null,
    task.project ? `Project: ${task.project}` : null,
    task.project_id ? `Project ID: ${task.project_id}` : null,
    ...sectionItems(landedSection),
    ...extractPaths(body, task.prompt).map(path => `Path: ${path}`),
  ].filter(Boolean), 7);

  return {
    taskId: task.id || null,
    title: task.title || 'Untitled delegated task',
    status,
    source: handoffPath ? 'handoff' : 'agent_task',
    summary: status === 'failed'
      ? uniqueItems([error || 'Task failed before returning a summary.'])
      : (sectionItems(summarySection).length ? sectionItems(summarySection) : fallbackLines),
    landed,
    verify: sectionItems(verificationSection).length
      ? sectionItems(verificationSection)
      : uniqueItems([
        status === 'completed' ? 'Open the changed surface and confirm the requested behavior.' : null,
        status === 'failed' ? 'Review the error, fix the blocker, then re-run the task.' : null,
        handoffPath ? `Check ${handoffPath} for any handoff notes.` : null,
      ].filter(Boolean), 4),
    completedAt: new Date().toISOString(),
  };
}
