// Repo scout, step three: answer questions from the map. What a file is
// linked to (and what else may need to change with it), and which files and
// lines best match a change described in plain words.

import fs from 'node:fs';
import path from 'node:path';
import { wordsOf } from './parse.js';

const STOP = new Set(`the and for with that this from into onto when what where which who why how
are was were been being have has had does did doing can could should would will shall may might must
make made change changes changed want wants need needs add adds added new old use uses used using
let lets get gets set sets put its it's our your their them they there here then than also just only
file files code line lines please some any all each every one two more most less very like look
fix bug issue thing things way work works working app censaios say says show shows put puts`.split(/\s+/));

const isTest = (rel) => /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/.test(rel);

export function requestWords(request) {
  return [...new Set(wordsOf(request).filter((w) => !STOP.has(w)))].slice(0, 16);
}

export function normalizeRelPath(map, input) {
  const raw = String(input || '').trim().replace(/\\/g, '/').replace(/^\.?\//, '');
  if (!raw) return null;
  if (map.files.has(raw)) return raw;
  const tail = [...map.files.keys()].filter((rel) => rel.endsWith(`/${raw}`) || rel === raw);
  return tail.length === 1 ? tail[0] : null;
}

// Files that use `rel`, one hop and then two hops out.
export function dependentsOf(map, rel, depth = 2) {
  const seen = new Set([rel]);
  const rings = [];
  let ring = [rel];
  for (let d = 0; d < depth; d += 1) {
    const next = [];
    for (const file of ring) {
      for (const user of map.importedBy.get(file) || []) {
        if (!seen.has(user)) { seen.add(user); next.push(user); }
      }
    }
    if (!next.length) break;
    rings.push(next.sort());
    ring = next;
  }
  return rings;
}

// Tests that load the file, or name it.
export function testsFor(map, rel) {
  const stem = path.posix.basename(rel).replace(/\.[^.]+$/, '').toLowerCase();
  const direct = (map.importedBy.get(rel) || []).filter(isTest);
  const named = [...map.files.keys()].filter((f) => isTest(f) && f.toLowerCase().includes(stem));
  return [...new Set([...direct, ...named])].slice(0, 12);
}

export function describeFile(map, rel) {
  const node = map.files.get(rel);
  const [near = [], far = []] = dependentsOf(map, rel);
  return {
    path: rel,
    lines: node.lines,
    about: node.about,
    symbols: node.symbols.slice(0, 60),
    imports: node.imports,
    packages: node.packages,
    usedBy: near,
    usedByIndirectly: far.slice(0, 40),
    tests: testsFor(map, rel),
  };
}

export function overview(map) {
  const hubs = [...map.importedBy.entries()]
    .map(([rel, users]) => ({ path: rel, usedBy: users.length }))
    .sort((a, b) => b.usedBy - a.usedBy || a.path.localeCompare(b.path))
    .slice(0, 12);
  const folders = new Map();
  for (const rel of map.files.keys()) {
    const top = rel.includes('/') ? rel.split('/').slice(0, 2).join('/') : '(top)';
    folders.set(top, (folders.get(top) || 0) + 1);
  }
  const biggestFolders = [...folders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([folder, files]) => ({ folder, files }));
  return { hubs, folders: biggestFolders };
}

function scoreFile(node, words, idf) {
  let score = 0;
  const hits = [];
  const pathWords = new Set(wordsOf(node.path));
  for (const word of words) {
    const weight = idf.get(word) || 0;
    if (!node.words.has(word)) continue;
    hits.push(word);
    score += weight;
    if (pathWords.has(word)) score += weight * 2;
    if (node.symbols.some((s) => wordsOf(s.name).includes(word))) score += weight;
  }
  if (hits.length > 1) score *= 1 + (hits.length - 1) * 0.6;
  if (isTest(node.path)) score *= 0.5;
  if (node.lang === 'md') score *= 0.6;
  return { score, hits };
}

export function quotedPhrases(request) {
  return [...String(request || '').matchAll(/["\u201c']([^"\u201d']{3,80})["\u201d']/g)].map((m) => m[1].toLowerCase());
}

function bestLines(content, words, symbols, phrases = []) {
  const lines = content.split(/\r?\n/);
  const defs = new Map(symbols.map((s) => [s.line, s]));
  const ranked = [];
  lines.forEach((text, i) => {
    const lineWords = new Set(wordsOf(text));
    const hit = words.filter((w) => lineWords.has(w));
    const lower = text.toLowerCase();
    const phrase = phrases.find((p) => lower.includes(p));
    if (!hit.length && !phrase) return;
    const at = phrase ? lower.indexOf(phrase) : Math.min(...hit.map((w) => lower.indexOf(w)).filter((n) => n >= 0));
    const score = hit.length + (defs.has(i + 1) ? 1.5 : 0) + (phrase ? 6 : 0);
    ranked.push({ line: i + 1, column: (Number.isFinite(at) ? at : 0) + 1, hits: hit, score, text: text.trim().slice(0, 200) });
  });
  ranked.sort((a, b) => b.score - a.score || a.line - b.line);
  return { picks: ranked.slice(0, 2), lines };
}

function snippet(lines, line, around = 3) {
  const from = Math.max(1, line - around);
  const to = Math.min(lines.length, line + around);
  const out = [];
  for (let n = from; n <= to; n += 1) out.push(`${n}: ${lines[n - 1].slice(0, 220)}`);
  return out.join('\n');
}

/** The files and lines that best match a change described in plain words. */
export async function findCandidates(map, request, { limit = 6 } = {}) {
  const words = requestWords(request);
  const phrases = quotedPhrases(request);
  if (!words.length) return { words, candidates: [] };
  const total = map.files.size || 1;
  const idf = new Map(words.map((w) => {
    let df = 0;
    for (const node of map.files.values()) if (node.words.has(w)) df += 1;
    return [w, df ? Math.log(1 + total / df) : 0];
  }));
  const ranked = [...map.files.values()]
    .map((node) => ({ node, ...scoreFile(node, words, idf) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  const candidates = [];
  for (const { node, score, hits } of ranked) {
    const content = await fs.promises.readFile(path.join(map.root, node.path), 'utf8').catch(() => '');
    const { picks, lines } = bestLines(content, words, node.symbols, phrases);
    const top = picks[0] || { line: 1, column: 1, hits, text: lines[0] || '' };
    const symbol = [...node.symbols].reverse().find((s) => s.line <= top.line) || null;
    candidates.push({
      path: node.path, score: Math.round(score * 10) / 10, matched: hits,
      line: top.line, column: top.column, text: top.text, symbol: symbol ? symbol.name : null,
      otherLines: picks.slice(1).map((p) => p.line),
      snippet: snippet(lines, top.line),
      usedBy: (map.importedBy.get(node.path) || []).length,
    });
  }
  return { words, candidates };
}
