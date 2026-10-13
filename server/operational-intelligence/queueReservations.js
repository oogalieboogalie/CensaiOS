import fs from 'fs';
import path from 'path';
import { readCurrentProject } from '../routes/projects/shared.js';
import { resolveProjectPathForRuntime } from '../workspaces/shared.js';

function clean(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
}

function zoneCovers(zone, file) {
  const z = clean(zone);
  const f = clean(file);
  if (!z || !f) return false;
  if (z.endsWith('/**')) return f.startsWith(z.slice(0, -2));
  if (z.endsWith('/')) return f.startsWith(z);
  return f === z || f.startsWith(`${z}/`);
}

function zonesOverlap(left, right) {
  return zoneCovers(left, right) || zoneCovers(right, left);
}

export function findZoneReservationConflict(requestedZones = [], reservations = []) {
  const requested = requestedZones.map(clean).filter(Boolean);
  for (const entry of Array.isArray(reservations) ? reservations : []) {
    const zones = Array.isArray(entry?.zones) ? entry.zones.map(clean).filter(Boolean) : [];
    const overlap = requested.find(zone => zones.some(existing => zonesOverlap(zone, existing)));
    if (overlap) {
      return {
        overlap,
        brief: entry.brief || null,
        agent: entry.agent || null,
        worktree: entry.worktree || null,
      };
    }
  }
  return null;
}

export async function readCurrentQueueReservations() {
  const currentProject = await readCurrentProject();
  if (!currentProject?.path) return [];
  const queuePath = path.join(
    resolveProjectPathForRuntime(currentProject.path),
    '.team',
    'handoffs',
    'queue.json'
  );
  try {
    const raw = await fs.promises.readFile(queuePath, 'utf8');
    const queue = JSON.parse(raw);
    return Array.isArray(queue.inflight) ? queue.inflight : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}
