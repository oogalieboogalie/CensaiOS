import fs from 'fs';
import { getFile as ghGetFile } from '../github.js';
import {
  DEFAULT_READ_MAX_CHARS,
  clampReadWindow,
  isGithubProject,
  resolveInsideProject,
} from './shared.js';

export function formatReadChunk(content, label, opts = {}) {
  const { offset, maxChars } = clampReadWindow(opts);
  const total = content.length;
  const start = Math.min(offset, total);
  const end = Math.min(start + maxChars, total);
  const chunk = content.slice(start, end);

  if (start === 0 && end === total) return chunk;

  const header = [
    `[partial read: ${label}]`,
    `chars ${start}-${end} of ${total}`,
    end < total ? `next chunk: call again with offset ${end}` : 'end of file',
    '',
  ].join('\n');
  return header + chunk;
}

export function isOutlineLine(line) {
  return /^\s*(import|export)\s/.test(line) ||
    /^\s*(async\s+)?function\s+\w+/.test(line) ||
    /^\s*(export\s+)?(async\s+)?function\s+\w+/.test(line) ||
    /^\s*(export\s+)?(const|let|var)\s+\w+\s*=/.test(line) ||
    /^\s*(class|export\s+class)\s+\w+/.test(line) ||
    /^\s*(case\s+['"`][^'"`]+['"`]\s*:|default\s*:)/.test(line) ||
    /^\s*(app|router)\.(get|post|put|patch|delete)\s*\(/.test(line);
}

export function formatFileOutline(content, label, { maxEntries = 200 } = {}) {
  const safeMax = Math.min(Math.max(20, Number(maxEntries) || 200), 500);
  const lines = content.split(/\r?\n/);
  const matches = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!isOutlineLine(line)) continue;
    matches.push(`${i + 1}: ${line.trim()}`);
    if (matches.length >= safeMax) break;
  }

  const truncated = matches.length >= safeMax;
  return [
    `[file outline: ${label}]`,
    `lines: ${lines.length}`,
    `entries: ${matches.length}${truncated ? ` (truncated at ${safeMax})` : ''}`,
    '',
    matches.join('\n') || '(no outline entries found)',
  ].join('\n');
}

export async function projectRead(project, relPath, { branch, offset = 0, maxChars = DEFAULT_READ_MAX_CHARS } = {}) {
  let content;
  if (isGithubProject(project)) {
    content = await ghGetFile(project.repo, relPath, branch);
    return formatReadChunk(content, `${project.repo}/${relPath}`, { offset, maxChars });
  }
  const abs = resolveInsideProject(project.path, relPath);
  content = await fs.promises.readFile(abs, 'utf8');
  return formatReadChunk(content, relPath, { offset, maxChars });
}

export async function projectFileOutline(project, relPath, { branch, maxEntries = 200 } = {}) {
  let content;
  if (isGithubProject(project)) {
    content = await ghGetFile(project.repo, relPath, branch);
    return formatFileOutline(content, `${project.repo}/${relPath}`, { maxEntries });
  }
  const abs = resolveInsideProject(project.path, relPath);
  content = await fs.promises.readFile(abs, 'utf8');
  return formatFileOutline(content, relPath, { maxEntries });
}
