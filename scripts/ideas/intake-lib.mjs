import fs from 'node:fs';
import path from 'node:path';

export const REQUIRED_FIELDS = ['title', 'date', 'source', 'status', 'phase', 'tags'];

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = [];
  for (const entry of entries) {
    const nextPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(nextPath));
      continue;
    }
    if (entry.isFile()) files.push(nextPath);
  }
  return files;
}

function parseValue(rawValue) {
  const value = rawValue.trim();
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return value;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return null;

  const data = {};
  const errors = [];
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf(':');
    if (separator === -1) {
      errors.push(`Invalid frontmatter line: ${line}`);
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1);
    data[key] = parseValue(value);
  }

  return { data, errors };
}

function classifyMarkdown(rootDir, filePath) {
  const relativePath = normalizePath(path.relative(rootDir, filePath));
  const content = fs.readFileSync(filePath, 'utf8');
  const frontmatter = parseFrontmatter(content);

  if (!frontmatter) {
    return { kind: 'raw', path: relativePath, reason: 'missing_frontmatter' };
  }

  const missingFields = REQUIRED_FIELDS.filter((field) => {
    const value = frontmatter.data[field];
    if (Array.isArray(value)) return value.length === 0;
    return typeof value !== 'string' || !value.trim();
  });
  if (!Array.isArray(frontmatter.data.tags)) {
    missingFields.push('tags');
  }

  if (frontmatter.errors.length || missingFields.length) {
    return {
      kind: 'invalid',
      path: relativePath,
      errors: [...frontmatter.errors],
      missingFields: [...new Set(missingFields)],
    };
  }

  return {
    kind: 'valid',
    path: relativePath,
    title: frontmatter.data.title,
    date: frontmatter.data.date,
    source: frontmatter.data.source,
    status: frontmatter.data.status,
    phase: frontmatter.data.phase,
    tags: frontmatter.data.tags,
  };
}

function classifyFile(rootDir, filePath) {
  if (path.extname(filePath).toLowerCase() === '.md') {
    return classifyMarkdown(rootDir, filePath);
  }
  return {
    kind: 'raw',
    path: normalizePath(path.relative(rootDir, filePath)),
    reason: 'non_markdown',
  };
}

export function scanIdeasDirectory(rootDir) {
  const files = walk(rootDir);
  const validCards = [];
  const invalidCards = [];
  const rawItems = [];

  for (const filePath of files) {
    const record = classifyFile(rootDir, filePath);
    if (record.kind === 'valid') validCards.push(record);
    if (record.kind === 'invalid') invalidCards.push(record);
    if (record.kind === 'raw') rawItems.push(record);
  }

  return {
    rootDir: normalizePath(rootDir),
    validCards,
    invalidCards,
    rawItems,
    summary: {
      filesScanned: files.length,
      validCards: validCards.length,
      invalidCards: invalidCards.length,
      rawItems: rawItems.length,
    },
  };
}

export function buildFailureMessage(report) {
  return report.invalidCards
    .map((card) => {
      const parts = [];
      if (card.missingFields.length) parts.push(`missing fields: ${card.missingFields.join(', ')}`);
      if (card.errors.length) parts.push(...card.errors);
      return `${card.path} -> ${parts.join('; ')}`;
    })
    .join('\n');
}
