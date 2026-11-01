// What an image is made of: its layers (`docker image history`, newest step
// first), when it was made and which containers use it. A step's command can
// hold a token or password set at build time, so the window shows the steps
// but the 'docker' log line names only the image.

import { createLogger } from '../logger.js';
import { docker, parseJsonLines, assertRef } from './cli.js';
import { parseSize } from './normalize.js';
import { listContainers } from './engine.js';

const log = createLogger('docker');
const MAX_STEP = 2000;

/** A history step as Docker prints it, minus the `/bin/sh -c #(nop)` noise. */
export function cleanStep(createdBy) {
  return String(createdBy || '')
    .replace(/^\/bin\/sh -c #\(nop\)\s*/, '')
    .replace(/^\/bin\/sh -c\s+/, 'RUN ')
    .replace(/^RUN \/bin\/sh -c\s+/, 'RUN ')
    .trim()
    .slice(0, MAX_STEP);
}

/** Pure: Docker's history and inspect answers plus the container list -> the detail the window shows. */
export function summarizeImage(ref, historyOut, inspectOut, containers = []) {
  const [info = {}] = parseJsonLines(inspectOut);
  const id = String(info.Id || '').replace(/^sha256:/, '');
  const tags = Array.isArray(info.RepoTags) ? info.RepoTags : [];
  const names = new Set([ref, ...tags, id, id.slice(0, 12)]);
  if (ref.endsWith(':latest')) names.add(ref.slice(0, -':latest'.length));
  const layers = parseJsonLines(historyOut).map((row) => ({
    id: row.ID && row.ID !== '<missing>' ? String(row.ID).replace(/^sha256:/, '').slice(0, 12) : '',
    createdSince: row.CreatedSince || '',
    createdAt: row.CreatedAt || '',
    step: cleanStep(row.CreatedBy),
    size: parseSize(row.Size),
    sizeText: row.Size || '0B',
  }));
  return {
    ref, id: id.slice(0, 12), tags,
    created: info.Created || '', os: info.Os || '', arch: info.Architecture || '',
    size: Number(info.Size) || layers.reduce((sum, l) => sum + l.size, 0),
    layers,
    inUseBy: containers.filter((c) => names.has(c.image)).map((c) => c.name),
  };
}

export async function imageHistory(ref) {
  assertRef(ref, 'image');
  const [history, inspect, containers] = await Promise.all([
    docker(['image', 'history', '--no-trunc', '--format', 'json', ref]),
    docker(['image', 'inspect', ref]),
    listContainers().catch(() => []),
  ]);
  const detail = summarizeImage(ref, history.stdout, inspect.stdout, containers);
  log.info("read an image's layers", { image: ref, layers: detail.layers.length });
  return detail;
}
