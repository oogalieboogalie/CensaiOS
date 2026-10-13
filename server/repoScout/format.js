// What the core agent reads back from its scout. Short, exact, and always
// ending with a reminder that the core agent makes the edit itself.

import { describeFile, normalizeRelPath, overview } from './query.js';
import { mapStats } from './map.js';

const list = (items, max = 12) => (items.length
  ? items.slice(0, max).join(', ') + (items.length > max ? ` and ${items.length - max} more` : '')
  : 'none');

export function formatMapOverview(project, map) {
  const stats = mapStats(map);
  const { hubs, folders } = overview(map);
  return [
    `Scout map of ${project.name}: ${stats.files} files, ${stats.symbols} functions/classes/routes, ${stats.links} import links.`,
    `Last look read ${stats.lastRefresh?.filesRead ?? 0} changed file(s) in ${stats.lastRefresh?.ms ?? 0} ms.`,
    '',
    'Most used files (change these with care):',
    ...hubs.map((h) => `- ${h.path} (used by ${h.usedBy})`),
    '',
    'Biggest folders:',
    ...folders.map((f) => `- ${f.folder}: ${f.files} files`),
    '',
    'Ask scout_map with a path to see what a file links to, or scout_find with a change to get the exact spot.',
  ].join('\n');
}

export function formatFileLinks(project, map, input) {
  const rel = normalizeRelPath(map, input);
  if (!rel) return `The scout has no file "${input}" in ${project.name}. Call scout_map without a path for an overview.`;
  const info = describeFile(map, rel);
  return [
    `${rel} (${info.lines} lines)${info.about ? `: ${info.about}` : ''}`,
    '',
    'Defines:',
    ...(info.symbols.length ? info.symbols.slice(0, 30).map((s) => `- line ${s.line}: ${s.kind} ${s.name}${s.exported ? ' (exported)' : ''}`) : ['- nothing the scout recognises']),
    '',
    `Uses: ${list(info.imports)}`,
    `Packages: ${list(info.packages)}`,
    `Used by (change these too if the change breaks them): ${list(info.usedBy, 20)}`,
    `Used indirectly by: ${list(info.usedByIndirectly)}`,
    `Tests: ${list(info.tests)}`,
  ].join('\n');
}

export function formatFind(project, result) {
  if (!result.found) return `Scout found nothing to change in ${project.name}. ${result.note}`;
  const who = result.pickedBy === 'model' ? `Scout (${result.model})` : 'Scout (map only)';
  const lines = [
    `${who}: change ${result.file} at line ${result.line}, column ${result.column}.`,
    `Why: ${result.reason}`,
  ];
  if (result.lineText) lines.push(`That line now: ${result.lineText}`);
  lines.push(
    `Also check (they use ${result.file}): ${list(result.alsoCheck.usedBy)}`,
    `Tests to run: ${list(result.alsoCheck.tests)}`,
    `Other places it looked: ${list(result.candidates.filter((c) => c.path !== result.file).map((c) => `${c.path}:${c.line}`), 5)}`,
  );
  if (result.modelError) lines.push(`Note: ${result.modelError}`);
  if (result.scoutModel?.reason) lines.push(`Note: ${result.scoutModel.reason}`);
  lines.push('The scout only points. Read the spot with project_read, then make the edit yourself with project_edit.');
  return lines.join('\n');
}
