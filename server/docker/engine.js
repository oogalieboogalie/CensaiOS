// Read side of the Docker manager: engine status, containers, live stats,
// images, volumes, networks and compose projects, normalized into stable
// camelCase shapes the window can render without knowing CLI quirks.

import { docker, parseJsonLines, parseLabels, assertRef, DockerUnavailableError } from './cli.js';
import { normalizeContainer, normalizeStats, summarizeInspect, splitList, parseSize } from './normalize.js';

export { parseHealth, parseSize, normalizeContainer, normalizeStats, summarizeInspect } from './normalize.js';

export async function listContainers() {
  const { stdout } = await docker(['ps', '-a', '--no-trunc', '--format', 'json']);
  return parseJsonLines(stdout).map(normalizeContainer);
}

export async function containerStats() {
  const { stdout } = await docker(['stats', '--no-stream', '--format', 'json'], { timeout: 20_000 });
  return parseJsonLines(stdout).map(normalizeStats);
}

export async function inspectContainer(id) {
  assertRef(id, 'container');
  const { stdout } = await docker(['inspect', '--type', 'container', id]);
  const [raw] = parseJsonLines(stdout);
  if (!raw) throw new Error(`No such container: ${id}`);
  return summarizeInspect(raw);
}

export async function containerLogs(id, { tail = 200, since } = {}) {
  assertRef(id, 'container');
  const lines = Math.min(Math.max(parseInt(tail, 10) || 200, 1), 5000);
  const args = ['logs', '--timestamps', `--tail=${lines}`];
  if (since && /^[0-9TZ:.+-]{1,40}$/.test(String(since))) args.push(`--since=${since}`);
  args.push(id);
  const { stdout, stderr } = await docker(args);
  // Docker writes the container's stderr stream to our stderr. Keep both,
  // ordered by their RFC3339 timestamp prefix.
  const tag = (text, stream) => String(text || '').split('\n').filter(Boolean).map((line) => {
    const sp = line.indexOf(' ');
    return { ts: sp > 0 ? line.slice(0, sp) : '', text: sp > 0 ? line.slice(sp + 1) : line, stream };
  });
  return [...tag(stdout, 'stdout'), ...tag(stderr, 'stderr')].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
}

export async function listImages() {
  const [{ stdout }, containers] = await Promise.all([
    docker(['images', '--format', 'json']),
    listContainers().catch(() => []),
  ]);
  return parseJsonLines(stdout).map((i) => {
    const ref = i.Tag && i.Tag !== '<none>' ? `${i.Repository}:${i.Tag}` : i.Repository;
    const users = containers.filter((c) => c.image === ref || (i.Tag === 'latest' && c.image === i.Repository) || c.image === i.ID);
    return {
      id: i.ID, repository: i.Repository, tag: i.Tag, ref,
      dangling: i.Repository === '<none>',
      size: parseSize(i.Size), sizeText: i.Size, createdSince: i.CreatedSince, createdAt: i.CreatedAt,
      inUseBy: users.map((c) => c.name),
    };
  });
}

export async function listVolumes() {
  const [{ stdout }, containers] = await Promise.all([
    docker(['volume', 'ls', '--format', 'json']),
    listContainers().catch(() => []),
  ]);
  return parseJsonLines(stdout).map((v) => ({
    name: v.Name, driver: v.Driver, scope: v.Scope, mountpoint: v.Mountpoint || '',
    composeProject: parseLabels(v.Labels)['com.docker.compose.project'] || null,
    inUseBy: containers.filter((c) => c.mounts.includes(v.Name)).map((c) => c.name),
  }));
}

const BUILTIN_NETWORKS = new Set(['bridge', 'host', 'none']);

export async function listNetworks() {
  const [{ stdout }, containers] = await Promise.all([
    docker(['network', 'ls', '--format', 'json']),
    listContainers().catch(() => []),
  ]);
  return parseJsonLines(stdout).map((n) => ({
    id: n.ID, name: n.Name, driver: n.Driver, scope: n.Scope,
    internal: String(n.Internal) === 'true', builtin: BUILTIN_NETWORKS.has(n.Name),
    composeProject: parseLabels(n.Labels)['com.docker.compose.project'] || null,
    inUseBy: containers.filter((c) => c.networks.includes(n.Name)).map((c) => c.name),
  }));
}

export async function listComposeProjects() {
  const [{ stdout }, containers] = await Promise.all([
    docker(['compose', 'ls', '-a', '--format', 'json']).catch(() => ({ stdout: '[]' })),
    listContainers(),
  ]);
  const known = new Map(parseJsonLines(stdout).map((p) => [p.Name, p]));
  for (const c of containers) {
    if (c.composeProject && !known.has(c.composeProject)) known.set(c.composeProject, { Name: c.composeProject });
  }
  return [...known.values()].map((p) => {
    const members = containers.filter((c) => c.composeProject === p.Name);
    return {
      name: p.Name,
      status: p.Status || '',
      configFiles: splitList(p.ConfigFiles),
      running: members.filter((c) => c.state === 'running').length,
      total: members.length,
      services: members.map((c) => ({ id: c.id, name: c.name, service: c.composeService, state: c.state, health: c.health })),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export async function engineStatus() {
  try {
    const [{ stdout: infoOut }, df] = await Promise.all([
      docker(['info', '--format', 'json'], { timeout: 10_000 }),
      docker(['system', 'df', '--format', 'json'], { timeout: 15_000 }).catch(() => ({ stdout: '' })),
    ]);
    const [info = {}] = parseJsonLines(infoOut);
    if (info.ServerErrors?.length) {
      throw new DockerUnavailableError(info.ServerErrors.join(' '), 'daemon-down');
    }
    return {
      available: true,
      engine: {
        name: info.Name, version: info.ServerVersion, os: info.OperatingSystem, arch: info.Architecture,
        cpus: info.NCPU, memTotal: info.MemTotal, driver: info.Driver,
      },
      counts: {
        containers: info.Containers || 0, running: info.ContainersRunning || 0,
        paused: info.ContainersPaused || 0, stopped: info.ContainersStopped || 0, images: info.Images || 0,
      },
      disk: parseJsonLines(df.stdout).map((d) => ({
        type: d.Type, total: Number(d.TotalCount) || 0, active: Number(d.Active) || 0,
        size: parseSize(d.Size), reclaimable: parseSize(d.Reclaimable), reclaimableText: d.Reclaimable,
      })),
    };
  } catch (err) {
    if (err instanceof DockerUnavailableError) return { available: false, reason: err.reason, message: err.message };
    throw err;
  }
}
