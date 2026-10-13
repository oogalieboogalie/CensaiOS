import fs from 'fs';
import path from 'path';
import {
  getFile as ghGetFile,
  putFile as ghPutFile,
} from '../github.js';
import {
  isGithubProject,
  resolveInsideProject,
} from './shared.js';

export function countOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  for (;;) {
    const next = text.indexOf(needle, index);
    if (next === -1) return count;
    count += 1;
    index = next + needle.length;
  }
}

export function dominantEol(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/(?<!\r)\n/g) || []).length;
  return crlf >= lf ? '\r\n' : '\n';
}

export function withLineEndings(text, eol) {
  return String(text ?? '').replace(/\r\n|\r|\n/g, eol);
}

export function normalizeNewlinesWithMap(text) {
  const input = String(text ?? '');
  let normalized = '';
  const map = [];

  for (let i = 0; i < input.length;) {
    map.push(i);
    const char = input[i];
    if (char === '\r') {
      normalized += '\n';
      i += input[i + 1] === '\n' ? 2 : 1;
    } else {
      normalized += char;
      i += 1;
    }
  }
  map.push(input.length);
  return { normalized, map };
}

export function replaceFromNormalizedMatch(text, normalizedText, map, normalizedOld, newStr, eol, label) {
  const count = countOccurrences(normalizedText, normalizedOld);
  if (count === 0) return null;
  if (count > 1) {
    throw new Error(`old_string matched ${count} times in ${label} after normalizing newlines; include more surrounding context so the edit is unique`);
  }
  const start = normalizedText.indexOf(normalizedOld);
  const end = start + normalizedOld.length;
  return text.slice(0, map[start]) + withLineEndings(newStr, eol) + text.slice(map[end]);
}

export function stripPartialReadHeader(text) {
  const value = String(text ?? '');
  if (!value.startsWith('[partial read:')) return value;
  const headerMatch = value.match(/^\[partial read:[^\n]*\]\r?\nchars [^\n]*\r?\n(?:next chunk:[^\n]*|end of file)\r?\n/);
  if (headerMatch) return value.slice(headerMatch[0].length);
  const lfBreak = value.indexOf('\n\n');
  if (lfBreak !== -1) return value.slice(lfBreak + 2);
  const crlfBreak = value.indexOf('\r\n\r\n');
  if (crlfBreak !== -1) return value.slice(crlfBreak + 4);
  return value;
}

export function replaceOneExact(text, oldStr, newStr, label) {
  const exactCount = countOccurrences(text, oldStr);
  if (exactCount === 1) {
    return text.replace(oldStr, newStr);
  }
  if (exactCount > 1) {
    throw new Error(`old_string matched ${exactCount} times in ${label}; include more surrounding context so the edit is unique`);
  }

  const eol = dominantEol(text);
  const normalizedOld = withLineEndings(oldStr, eol);
  if (normalizedOld !== oldStr) {
    const normalizedCount = countOccurrences(text, normalizedOld);
    if (normalizedCount === 1) {
      return text.replace(normalizedOld, withLineEndings(newStr, eol));
    }
    if (normalizedCount > 1) {
      throw new Error(`old_string matched ${normalizedCount} times in ${label} after normalizing line endings; include more surrounding context so the edit is unique`);
    }
  }

  const { normalized: normalizedText, map } = normalizeNewlinesWithMap(text);
  const normalizedNeedle = normalizeNewlinesWithMap(oldStr).normalized;
  if (normalizedNeedle) {
    const updated = replaceFromNormalizedMatch(text, normalizedText, map, normalizedNeedle, newStr, eol, label);
    if (updated !== null) return updated;
  }

  const withoutHeader = stripPartialReadHeader(oldStr);
  if (withoutHeader !== oldStr) {
    const headerlessCount = countOccurrences(text, withoutHeader);
    if (headerlessCount === 1) return text.replace(withoutHeader, newStr);
    if (headerlessCount > 1) {
      throw new Error(`old_string matched ${headerlessCount} times in ${label} after removing the project_read header; include more surrounding context so the edit is unique`);
    }

    const updated = replaceFromNormalizedMatch(
      text,
      normalizedText,
      map,
      normalizeNewlinesWithMap(withoutHeader).normalized,
      newStr,
      eol,
      label
    );
    if (updated !== null) return updated;
  }

  const trimmedOld = String(oldStr ?? '').trim();
  if (trimmedOld && trimmedOld !== oldStr) {
    const trimmedCount = countOccurrences(text, trimmedOld);
    if (trimmedCount === 1) return text.replace(trimmedOld, String(newStr ?? '').trim());
    if (trimmedCount > 1) {
      throw new Error(`old_string matched ${trimmedCount} times in ${label} after trimming surrounding whitespace; include more surrounding context so the edit is unique`);
    }
  }

  throw new Error([
    `old_string not found in ${label}`,
    'Tips: do not include the [partial read] header from project_read; if the file is large, read the next chunk with offset/max_chars or use project_file_outline first; for multiline edits, include a smaller unique block around the exact lines you want to replace.',
  ].join('. '));
}

export async function projectWrite(project, relPath, content, { branch, message } = {}) {
  if (isGithubProject(project)) {
    const msg = message || `Update ${relPath}`;
    await ghPutFile(project.repo, relPath, content, msg, branch);
    return branch
      ? `https://github.com/${project.repo}/blob/${branch}/${relPath}`
      : `https://github.com/${project.repo}/blob/HEAD/${relPath}`;
  }
  const abs = resolveInsideProject(project.path, relPath);
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, content, 'utf8');
  return abs;
}

export async function projectEdit(project, relPath, oldStr, newStr, { branch, message } = {}) {
  if (isGithubProject(project)) {
    const text = await ghGetFile(project.repo, relPath, branch);
    const updated = replaceOneExact(text, oldStr, newStr, relPath);
    const msg = message || `Edit ${relPath}`;
    await ghPutFile(project.repo, relPath, updated, msg, branch);
    return branch
      ? `https://github.com/${project.repo}/blob/${branch}/${relPath}`
      : `https://github.com/${project.repo}/blob/HEAD/${relPath}`;
  }
  const abs = resolveInsideProject(project.path, relPath);
  const text = await fs.promises.readFile(abs, 'utf8');
  const updated = replaceOneExact(text, oldStr, newStr, relPath);
  await fs.promises.writeFile(abs, updated, 'utf8');
  return abs;
}
