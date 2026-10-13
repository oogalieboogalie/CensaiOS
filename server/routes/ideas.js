import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { resourceRateLimiter } from '../middleware/standardRateLimits.js';
// Layering note: these .mjs libs are plain dependency-free node ESM
// (no I/O in recommend-lib; fs-only scans in intake-lib), so sharing them
// between the CLI and this route keeps one canonical index implementation.
import { scanIdeasDirectory } from '../../scripts/ideas/intake-lib.mjs';
import { CANONICAL_DISPOSITIONS } from '../../scripts/ideas/recommend-lib.mjs';

export const ideasRouter = express.Router();
ideasRouter.use(resourceRateLimiter);

const REPOSITORY_ROOT = fs.realpathSync(process.cwd());
// Read lazily so tests and self-hosters can point the inbox elsewhere
// (same pattern as CENSAI_STATE_DIR / CENSAI_FAMILY_AGENTS_FILE).
function ideasDir() {
  const dir = process.env.CENSAI_IDEAS_DIR
    ? path.resolve(process.env.CENSAI_IDEAS_DIR)
    : path.join(REPOSITORY_ROOT, '.team', 'ideas');
  // Real path when it exists, so the symlink-escape check below compares like with like.
  return fs.existsSync(dir) ? fs.realpathSync(dir) : dir;
}
// A fresh install has no ideas folder yet: that is an empty inbox, not an error.
const EMPTY_REPORT = Object.freeze({
  validCards: [], invalidCards: [], rawItems: [],
  summary: { filesScanned: 0, validCards: 0, invalidCards: 0, rawItems: 0 },
});
function scanIdeas() {
  const dir = ideasDir();
  return fs.existsSync(dir) ? scanIdeasDirectory(dir) : EMPTY_REPORT;
}
const FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.\-]*\.md$/;

// The idea-card lifecycle tracks routing via the `status:` frontmatter
// field; the canonical disposition set is the only accepted vocabulary.
export function setStatusFrontmatter(content, status) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return null;
  const line = `status: ${status}`;
  const block = /^status:.*$/m.test(m[1])
    ? m[1].replace(/^status:.*$/m, line)
    : `${m[1].replace(/\s+$/, '')}\n${line}`;
  return `${content.slice(0, m.index)}---\n${block}\n---\n${content.slice(m.index + m[0].length)}`;
}

export function resolveIdeaFile(file) {
  if (typeof file !== 'string' || !FILENAME_RE.test(file) || file.includes('..')) {
    throw new Error('Invalid idea file: basename .md only, no traversal');
  }
  const candidate = path.resolve(ideasDir(), file);
  const relative = path.relative(ideasDir(), candidate);
  if (relative === '' || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('Invalid idea file: outside the ideas directory');
  }
  return candidate;
}

ideasRouter.get('/', (req, res) => {
  try {
    const report = scanIdeas();
    res.json({
      cards: report.validCards,
      invalid: report.invalidCards.map((c) => c.path),
      raw: report.rawItems.map((c) => c.path),
      summary: report.summary,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

ideasRouter.post('/disposition', (req, res) => {
  try {
    const { file, disposition } = req.body || {};
    if (!file) return res.status(400).json({ error: 'file is required' });
    if (!CANONICAL_DISPOSITIONS.includes(disposition)) {
      return res.status(400).json({ error: `disposition must be one of: ${CANONICAL_DISPOSITIONS.join(', ')}` });
    }
    let fullPath;
    try {
      fullPath = resolveIdeaFile(file);
    } catch (e) {
      return res.status(403).json({ error: e.message });
    }
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Idea file not found' });
    const real = fs.realpathSync(fullPath);
    if (path.relative(ideasDir(), real).startsWith(`..${path.sep}`)) {
      return res.status(403).json({ error: 'Invalid idea file: outside the ideas directory' });
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    const updated = setStatusFrontmatter(content, disposition);
    if (updated === null) return res.status(422).json({ error: 'Idea file has no frontmatter to update' });
    fs.writeFileSync(fullPath, updated, 'utf8');
    const report = scanIdeas();
    const card = report.validCards.find((c) => c.path === file) || null;
    res.json({ ok: true, card, summary: report.summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
