// A fake Docker CLI for tests and offline demos. `createFakeDocker()` answers
// the exact `docker ...` argv the server sends with canned engine data, and
// keeps container state so start/stop/remove behave like a real daemon.

const NOW = Date.parse('2026-10-04T02:00:00Z');
const iso = (minsAgo) => new Date(NOW - minsAgo * 60_000).toISOString();
const hex = (seed) => seed.repeat(64).slice(0, 64);

function seedContainers() {
  const c = (seed, name, image, state, status, extra = {}) => ({
    ID: hex(seed), Names: name, Image: image, State: state, Status: status,
    Command: '"docker-entrypoint.sh"', CreatedAt: '2026-10-03 21:14:02 +0000 UTC', RunningFor: '5 hours ago',
    Ports: '', Networks: 'bridge', Mounts: '', Labels: '', ...extra,
  });
  const compose = (project, service) => `com.docker.compose.project=${project},com.docker.compose.service=${service}`;
  return [
    c('a1', 'homebase-app-1', 'homebase:latest', 'running', 'Up 5 hours (healthy)', { Ports: '0.0.0.0:3001->3001/tcp, :::3001->3001/tcp', Networks: 'homebase_default', Labels: compose('homebase', 'app') }),
    c('b2', 'homebase-postgres-1', 'postgres:16-alpine', 'running', 'Up 5 hours (healthy)', { Ports: '0.0.0.0:5433->5432/tcp', Networks: 'homebase_default', Mounts: 'homebase_pgdata', Labels: compose('homebase', 'postgres') }),
    c('c3', 'homebase-redis-1', 'redis:7', 'running', 'Up 5 hours', { Ports: '6379/tcp', Networks: 'homebase_default', Labels: compose('homebase', 'redis') }),
    c('d4', 'automation-n8n-1', 'n8nio/n8n:1.62.1', 'running', 'Up 2 hours (healthy)', { Ports: '0.0.0.0:5678->5678/tcp', Networks: 'automation_default', Mounts: 'automation_n8n_data', Labels: compose('automation', 'n8n') }),
    c('e5', 'automation-qdrant-1', 'qdrant/qdrant:v1.11.0', 'running', 'Up 2 hours (unhealthy)', { Ports: '0.0.0.0:6333->6333/tcp, 0.0.0.0:6334->6334/tcp', Networks: 'automation_default', Mounts: 'automation_qdrant', Labels: compose('automation', 'qdrant') }),
    c('f6', 'ollama', 'ollama/ollama:latest', 'running', 'Up 3 days', { Ports: '0.0.0.0:11434->11434/tcp', Mounts: 'ollama' }),
    c('a7', 'homebase-sbx-7f3a2c', 'homebase-sandbox:node22', 'running', 'Up 12 minutes', { Labels: 'homebase.hostPath=/home/alex/projects/leadhound' }),
    c('b8', 'nightly-migrate', 'homebase:latest', 'exited', 'Exited (1) 3 hours ago'),
    c('c9', 'mailpit', 'axllent/mailpit:latest', 'exited', 'Exited (0) 2 days ago', { Ports: '' }),
  ];
}

const STATS = {
  a1: ['14.62%', '412.3MiB / 15.52GiB', '2.66%', '48.2MB / 31.9MB', '120MB / 8.19MB', '23'],
  b2: ['3.10%', '186.4MiB / 15.52GiB', '1.17%', '12.4MB / 40.1MB', '402MB / 1.2GB', '14'],
  c3: ['0.41%', '9.8MiB / 15.52GiB', '0.06%', '1.1MB / 900kB', '0B / 0B', '6'],
  d4: ['6.85%', '298.7MiB / 15.52GiB', '1.88%', '8.3MB / 2.2MB', '88MB / 12MB', '19'],
  e5: ['71.20%', '2.31GiB / 15.52GiB', '14.88%', '3.4MB / 1.9MB', '1.4GB / 640MB', '41'],
  f6: ['38.90%', '6.12GiB / 15.52GiB', '39.43%', '210MB / 4.1MB', '9.8GB / 12MB', '17'],
  a7: ['1.05%', '64.1MiB / 15.52GiB', '0.40%', '2MB / 300kB', '20MB / 4MB', '8'],
};

const IMAGES = [
  ['3f1a9c2b7d10', 'homebase', 'latest', '2 hours ago', '1.21GB'],
  ['8b0e4c1d2a33', 'postgres', '16-alpine', '3 weeks ago', '274MB'],
  ['c47a1f0e9b21', 'redis', '7', '4 weeks ago', '117MB'],
  ['5d2e8f7a6c44', 'n8nio/n8n', '1.62.1', '6 weeks ago', '1.02GB'],
  ['9a6b3c2d1e55', 'qdrant/qdrant', 'v1.11.0', '2 months ago', '205MB'],
  ['1e4f7a0b3c66', 'ollama/ollama', 'latest', '5 days ago', '3.43GB'],
  ['6c9d2e5f8a77', 'homebase-sandbox', 'node22', '1 day ago', '892MB'],
  ['2b5e8a1c4d88', 'axllent/mailpit', 'latest', '3 months ago', '31.5MB'],
  ['7f0a3b6c9d99', '<none>', '<none>', '9 days ago', '1.19GB'],
];

const LOG_LINES = [
  ['stdout', 'Homebase server listening on http://0.0.0.0:3001'],
  ['stdout', '[collab] y-websocket ready on /collab (2 docs loaded)'],
  ['stdout', 'GET /api/workspaces/personal 200 12ms'],
  ['stderr', 'WARN  provider openrouter: rate limited, retrying in 2s'],
  ['stdout', 'POST /api/chat 200 1840ms model=claude-sonnet-5-5'],
  ['stdout', '[agent-registry] heartbeat: 6 agents online'],
  ['stdout', 'GET /api/docker/containers 200 41ms'],
  ['stderr', 'error: relation "lead_sequences" does not exist (retrying migration 047)'],
  ['stdout', 'migration 047 applied in 88ms'],
  ['stdout', 'GET /api/docker/stats 200 1912ms'],
];

function inspect(ct) {
  const short = ct.ID.slice(0, 2);
  const running = ct.State === 'running';
  const ports = {};
  for (const p of String(ct.Ports).split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = p.match(/(?:([\d.:]*):(\d+)->)?(\d+\/\w+)/);
    if (m) ports[m[3]] = m[2] ? [{ HostIp: '0.0.0.0', HostPort: m[2] }] : null;
  }
  const health = /\((un)?healthy\)/.exec(ct.Status);
  return {
    Id: ct.ID, Name: `/${ct.Names}`, Created: iso(300), Image: `sha256:${hex(short)}`,
    State: {
      Status: ct.State, Running: running, Paused: ct.State === 'paused', Restarting: false, OOMKilled: false,
      Pid: running ? 4242 : 0, ExitCode: running ? 0 : Number((/Exited \((\d+)\)/.exec(ct.Status) || [])[1] || 0),
      Error: '', StartedAt: iso(300), FinishedAt: running ? '0001-01-01T00:00:00Z' : iso(180),
      Health: health ? {
        Status: health[1] ? 'unhealthy' : 'healthy', FailingStreak: health[1] ? 4 : 0,
        Log: [{ ExitCode: health[1] ? 1 : 0, Output: health[1] ? 'curl: (7) Failed to connect to localhost port 6333' : 'ok', End: iso(1) }],
      } : undefined,
    },
    RestartCount: ct.Names === 'automation-qdrant-1' ? 3 : 0,
    HostConfig: { RestartPolicy: { Name: ct.Labels.includes('compose') ? 'unless-stopped' : 'no' } },
    Config: {
      Image: ct.Image, WorkingDir: '/app', Entrypoint: ['docker-entrypoint.sh'], Cmd: ['node', 'server.js'],
      Env: ['NODE_ENV=production', 'PORT=3001', 'DATABASE_URL=postgres://homebase@postgres:5432/homebase', 'OPENAI_API_KEY=sk-live-should-be-hidden', 'PATH=/usr/local/bin:/usr/bin'],
      Labels: {},
    },
    NetworkSettings: {
      Ports: ports,
      Networks: Object.fromEntries(String(ct.Networks).split(',').map((n, i) => [n, { IPAddress: running ? `172.18.0.${i + 2}` : '', Gateway: '172.18.0.1', Aliases: [] }])),
    },
    Mounts: String(ct.Mounts).split(',').filter(Boolean).map((v) => ({ Type: 'volume', Name: v, Source: `/var/lib/docker/volumes/${v}/_data`, Destination: '/data', Mode: 'z', RW: true })),
  };
}

export function createFakeDocker({ daemon = 'up', state } = {}) {
  const st = state || { containers: seedContainers(), images: IMAGES.map((r) => [...r]) };
  const find = (ref) => st.containers.find((c) => c.ID === ref || c.ID.startsWith(ref) || c.Names === ref);
  const ok = (stdout = '') => ({ stdout, stderr: '', code: 0 });
  const fail = (stderr, code = 1) => ({ stdout: '', stderr, code });
  let template = null;
  // `--format json` gets JSON lines; a Go template like '{{.Names}}|{{.Status}}'
  // gets each row's fields substituted, which is all the other callers use.
  const render = (r) => template.replace(/\{\{\s*\.(\w+)\s*\}\}/g, (_, k) => r[k] ?? '').replace(/\{\{[^}]*\}\}/g, '');
  const lines = (rows) => rows.map((r) => (template ? render(r) : JSON.stringify(r))).join('\n') + '\n';

  function exec(command, args) {
    const fmt = args.indexOf('--format');
    template = fmt >= 0 && args[fmt + 1] !== 'json' ? args[fmt + 1] : null;
    if (command !== 'docker') return fail(`unexpected command ${command}`);
    if (daemon === 'missing') return { stdout: '', stderr: 'spawn docker ENOENT', code: 'ENOENT' };
    if (daemon === 'down') return fail('Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?');
    const [verb, ...rest] = args;
    const target = rest[rest.length - 1];
    switch (verb) {
      case 'info': return ok(JSON.stringify({
        Name: 'alex-desktop', ServerVersion: '27.3.1', OperatingSystem: 'Docker Desktop', Architecture: 'x86_64', NCPU: 16,
        MemTotal: 16_664_788_992, Driver: 'overlay2', Images: st.images.length, Containers: st.containers.length,
        ContainersRunning: st.containers.filter((c) => c.State === 'running').length, ContainersPaused: st.containers.filter((c) => c.State === 'paused').length,
        ContainersStopped: st.containers.filter((c) => c.State === 'exited').length,
      }));
      case 'system': return ok(lines([
        { Type: 'Images', TotalCount: String(st.images.length), Active: '7', Size: '8.37GB', Reclaimable: '1.22GB (14%)' },
        { Type: 'Containers', TotalCount: String(st.containers.length), Active: '7', Size: '412MB', Reclaimable: '18MB (4%)' },
        { Type: 'Local Volumes', TotalCount: '6', Active: '4', Size: '4.81GB', Reclaimable: '220MB (4%)' },
        { Type: 'Build Cache', TotalCount: '84', Active: '0', Size: '2.1GB', Reclaimable: '2.1GB' },
      ]));
      case 'ps': return ok(lines(st.containers));
      case 'stats': return ok(lines(st.containers.filter((c) => c.State === 'running').map((c) => {
        const s = STATS[c.ID.slice(0, 2)] || ['0.50%', '20MiB / 15.52GiB', '0.13%', '0B / 0B', '0B / 0B', '3'];
        const jitter = (v) => `${(parseFloat(v) * (0.85 + Math.random() * 0.3)).toFixed(2)}%`;
        return { ID: c.ID.slice(0, 12), Name: c.Names, CPUPerc: jitter(s[0]), MemUsage: s[1], MemPerc: s[2], NetIO: s[3], BlockIO: s[4], PIDs: s[5] };
      })));
      case 'inspect': { const c = find(target); return c ? ok(JSON.stringify([inspect(c)])) : fail(`Error: No such container: ${target}`); }
      case 'logs': {
        if (!find(target)) return fail(`Error response from daemon: No such container: ${target}`);
        const out = LOG_LINES.map(([stream, text], i) => ({ stream, line: `${iso(LOG_LINES.length - i)} ${text}` }));
        return { stdout: out.filter((l) => l.stream === 'stdout').map((l) => l.line).join('\n'), stderr: out.filter((l) => l.stream === 'stderr').map((l) => l.line).join('\n'), code: 0 };
      }
      case 'start': case 'unpause': case 'restart': { const c = find(target); if (!c) return fail(`Error response from daemon: No such container: ${target}`); c.State = 'running'; c.Status = 'Up Less than a second'; return ok(`${target}\n`); }
      case 'stop': case 'kill': { const c = find(target); if (!c) return fail(`Error response from daemon: No such container: ${target}`); c.State = 'exited'; c.Status = 'Exited (0) Less than a second ago'; return ok(`${target}\n`); }
      case 'pause': { const c = find(target); if (!c) return fail('No such container'); c.State = 'paused'; c.Status = 'Up 5 hours (Paused)'; return ok(`${target}\n`); }
      case 'rm': { const c = find(target); if (!c) return fail(`Error response from daemon: No such container: ${target}`); if (c.State === 'running' && !rest.includes('-f')) return fail('Error response from daemon: cannot remove container: container is running: stop the container before removing or force remove'); st.containers = st.containers.filter((x) => x !== c); return ok(`${target}\n`); }
      case 'exec': {
        const cmd = rest.slice(rest.indexOf('-c') + 1).join(' ');
        if (cmd === 'exit 3') return { stdout: '', stderr: '', code: 3 };
        if (cmd.startsWith('ls')) return ok('total 24\ndrwxr-xr-x 1 node node 4096 Oct  4 01:12 .\n-rw-r--r-- 1 node node 1873 Oct  4 01:12 package.json\ndrwxr-xr-x 1 node node 4096 Oct  4 01:12 server\n');
        return ok(`ran: ${cmd}\n`);
      }
      case 'images': return ok(lines(st.images.map(([ID, Repository, Tag, CreatedSince, Size]) => ({ ID, Repository, Tag, CreatedSince, Size, CreatedAt: '2026-10-01 10:00:00 +0000 UTC' }))));
      case 'image': {
        if (rest[0] === 'prune') { st.images = st.images.filter((i) => i[1] !== '<none>'); return ok('Deleted Images:\nsha256:7f0a3b6c9d99\n\nTotal reclaimed space: 1.19GB\n'); }
        const before = st.images.length;
        st.images = st.images.filter((i) => `${i[1]}:${i[2]}` !== target && i[0] !== target);
        return before === st.images.length ? fail(`Error response from daemon: No such image: ${target}`) : ok(`Untagged: ${target}\n`);
      }
      case 'pull': st.images.push([Math.random().toString(16).slice(2, 14), target.split(':')[0], target.split(':')[1] || 'latest', 'Less than a second ago', '42.1MB']); return ok(`docker.io/library/${target}\n`);
      case 'volume':
        if (rest[0] === 'prune') return ok('Total reclaimed space: 220MB\n');
        if (rest[0] === 'rm') return target === 'homebase_pgdata' ? fail('Error response from daemon: remove homebase_pgdata: volume is in use') : ok(`${target}\n`);
        return ok(lines([
          { Name: 'homebase_pgdata', Driver: 'local', Scope: 'local', Labels: 'com.docker.compose.project=homebase' },
          { Name: 'automation_n8n_data', Driver: 'local', Scope: 'local', Labels: 'com.docker.compose.project=automation' },
          { Name: 'automation_qdrant', Driver: 'local', Scope: 'local', Labels: 'com.docker.compose.project=automation' },
          { Name: 'ollama', Driver: 'local', Scope: 'local', Labels: '' },
          { Name: '4c1f8e2a9b7d6e5f4c3b2a1908f7e6d5c4b3a291', Driver: 'local', Scope: 'local', Labels: '' },
          { Name: 'mailpit_data', Driver: 'local', Scope: 'local', Labels: '' },
        ]));
      case 'network':
        if (rest[0] === 'prune') return ok('Deleted Networks:\nold_default\n');
        if (rest[0] === 'rm') return ok(`${target}\n`);
        return ok(lines([
          { ID: 'n1a2b3c4d5e6', Name: 'bridge', Driver: 'bridge', Scope: 'local', Internal: 'false', Labels: '' },
          { ID: 'n2b3c4d5e6f7', Name: 'host', Driver: 'host', Scope: 'local', Internal: 'false', Labels: '' },
          { ID: 'n3c4d5e6f7a8', Name: 'none', Driver: 'null', Scope: 'local', Internal: 'false', Labels: '' },
          { ID: 'n4d5e6f7a8b9', Name: 'homebase_default', Driver: 'bridge', Scope: 'local', Internal: 'false', Labels: 'com.docker.compose.project=homebase' },
          { ID: 'n5e6f7a8b9c0', Name: 'automation_default', Driver: 'bridge', Scope: 'local', Internal: 'false', Labels: 'com.docker.compose.project=automation' },
          { ID: 'n6f7a8b9c0d1', Name: 'legacy_backend', Driver: 'bridge', Scope: 'local', Internal: 'true', Labels: '' },
        ]));
      case 'compose':
        if (rest[0] === 'ls') return ok(JSON.stringify([
          { Name: 'automation', Status: 'running(2)', ConfigFiles: '/home/alex/stacks/automation/compose.yml' },
          { Name: 'homebase', Status: 'running(3)', ConfigFiles: '/home/alex/Homebase/docker-compose.yml' },
        ]));
        return { stdout: '', stderr: `Container ${rest[1]} ${rest[rest.length - 1]} done\n`, code: 0 };
      default: return fail(`docker: '${verb}' is not a docker command.`);
    }
  }
  return { exec, state: st };
}
