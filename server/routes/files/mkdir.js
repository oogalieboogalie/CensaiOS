import express from 'express';
import fs from 'fs';
import path from 'path';
import { requireLocalFilesystem } from '../../middleware/runtimeMode.js';
import { validateProjectPath } from './pathUtils.js';

export const mkdirRouter = express.Router();

const MAX_NAME_CHARS = 100;
const INVALID_NAME_CHARS = /[\\/<>:"|?*]/;

function hasControlChar(value) {
  for (const ch of value) {
    if (ch.charCodeAt(0) < 32) return true;
  }
  return false;
}

export function validateEntryName(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return { ok: false, error: 'Name is required' };
  if (trimmed === '.' || trimmed === '..') return { ok: false, error: 'Invalid name' };
  if (trimmed.length > MAX_NAME_CHARS) return { ok: false, error: 'Name is too long' };
  if (INVALID_NAME_CHARS.test(trimmed) || hasControlChar(trimmed)) {
    return { ok: false, error: 'Name contains invalid characters' };
  }
  return { ok: true, name: trimmed };
}

mkdirRouter.post('/files/mkdir', requireLocalFilesystem, async (req, res) => {
  const { path: parentPath, name } = req.body || {};
  if (!parentPath) return res.status(400).json({ error: 'Missing path in body' });
  const valid = validateEntryName(name);
  if (!valid.ok) return res.status(400).json({ error: valid.error });
  try {
    const resolvedParent = await validateProjectPath(parentPath);
    const stats = await fs.promises.stat(resolvedParent);
    if (!stats.isDirectory()) return res.status(400).json({ error: 'Not a directory' });
    const created = path.join(resolvedParent, valid.name);
    await fs.promises.mkdir(created, { recursive: false });
    res.json({ ok: true, path: created, name: valid.name });
  } catch (err) {
    if (err?.code === 'EEXIST') return res.status(409).json({ error: 'Already exists' });
    res.status(err.message?.startsWith('Access denied') ? 403 : 500).json({ error: err.message });
  }
});
