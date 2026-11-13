// The list of things that need the owner. A JSON file, not a new database table.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAX_OPEN = 100;
const MAX_KEPT = 200;

function stateFile(file) {
  if (file) return file;
  const root = process.env.CENSAI_STATE_DIR
    ? path.resolve(process.env.CENSAI_STATE_DIR)
    : path.join(repoRoot, '.homebase-state');
  return path.join(root, 'confirmations', 'items.json');
}

function cleanText(value, max) {
  const text = String(value ?? '')
    .replace(/[<>]/g, ' ')
    .split('')
    .map((ch) => (ch.charCodeAt(0) < 32 ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || text.length > max) return '';
  return text;
}

function safePullUrl(url) {
  try {
    const parsed = new URL(String(url || ''));
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

export function createConfirmationStore({ file, now = () => new Date().toISOString() } = {}) {
  const target = stateFile(file);
  let items = [];
  let broken = false;

  function load() {
    broken = false;
    if (!fs.existsSync(target)) {
      items = [];
      return;
    }
    try {
      const saved = JSON.parse(fs.readFileSync(target, 'utf8'));
      items = Array.isArray(saved.items) ? saved.items : [];
    } catch {
      broken = true;
      items = [];
    }
  }

  function save() {
    const dir = path.dirname(target);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, items }, null, 1), { mode: 0o600 });
    fs.renameSync(tmp, target);
  }

  function trim() {
    const open = items.filter((item) => item.status === 'open');
    const done = items.filter((item) => item.status !== 'open');
    const room = Math.max(0, MAX_KEPT - open.length);
    items = [...open, ...done.slice(-room)];
  }

  function refuseBroken() {
    if (!broken) return;
    const err = new Error('confirmations');
    err.code = 'confirmations-unreadable';
    throw err;
  }

  load();

  return {
    listOpen() {
      load();
      refuseBroken();
      return items.filter((item) => item.status === 'open').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },

    addAsk({ title, detail = '', actionLabel = '' }) {
      const cleanTitle = cleanText(title, 200);
      if (!cleanTitle) {
        const err = new Error('confirmations');
        err.code = 'confirmations-title';
        throw err;
      }
      const cleanDetail = cleanText(detail, 500);
      const label = cleanText(actionLabel, 80) || 'Mark done';
      load();
      refuseBroken();
      const open = items.filter((item) => item.status === 'open');
      const same = open.find((item) => item.kind === 'ask' && item.title === cleanTitle && item.detail === cleanDetail);
      if (same) return same;
      if (open.length >= MAX_OPEN) {
        const err = new Error('confirmations');
        err.code = 'confirmations-full';
        throw err;
      }
      const item = {
        id: `ask-${randomBytes(8).toString('hex')}`,
        kind: 'ask',
        title: cleanTitle,
        detail: cleanDetail,
        actionLabel: label,
        url: '',
        sha: '',
        status: 'open',
        createdAt: now(),
      };
      items.push(item);
      trim();
      save();
      return item;
    },

    upsertRisky({ number, sha, title, detail, actionLabel, url }) {
      load();
      refuseBroken();
      const id = `pr-${Number(number)}`;
      const existing = items.find((item) => item.id === id);
      if (existing && existing.status === 'done' && existing.sha === sha) return existing;
      const item = {
        id,
        kind: 'risky-pr',
        title: cleanText(title, 200) || `Pull request ${number} needs you`,
        detail: cleanText(detail, 500),
        actionLabel: cleanText(actionLabel, 80) || `Mark pull request ${number} handled`,
        url: safePullUrl(url),
        sha: String(sha || ''),
        number: Number(number),
        status: 'open',
        createdAt: existing?.createdAt || now(),
      };
      items = items.filter((row) => row.id !== id);
      items.push(item);
      trim();
      save();
      return item;
    },

    markDone(id) {
      load();
      refuseBroken();
      const item = items.find((row) => row.id === String(id || ''));
      if (!item || item.status !== 'open') return null;
      item.status = 'done';
      item.doneAt = now();
      save();
      return item;
    },

    resolveRisky(number) {
      return this.markDone(`pr-${Number(number)}`);
    },

    settleClosed(openNumbers) {
      const open = new Set(openNumbers);
      load();
      if (broken) return;
      let changed = false;
      for (const item of items) {
        if (item.kind === 'risky-pr' && item.status === 'open' && !open.has(item.number)) {
          item.status = 'done';
          item.doneAt = now();
          changed = true;
        }
      }
      if (changed) save();
    },
  };
}

let shared = null;

export function confirmationStore() {
  if (!shared) shared = createConfirmationStore();
  return shared;
}
