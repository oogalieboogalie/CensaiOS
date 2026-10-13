import { runnerClient } from '../../runner/client.js';

const PROJECT_ROOT = process.cwd();

function dockerArgs(args, options = {}) {
  return runnerClient.exec('docker', args, {
    cwd: PROJECT_ROOT,
    ...options,
  });
}

function noDockerError(err) {
  return err.code === 'ENOENT' || (err.message && err.message.includes('not found'));
}

function parseLabels(raw) {
  const out = {};
  if (typeof raw !== 'string' || !raw) return out;
  for (const pair of raw.split(',')) {
    const idx = pair.indexOf('=');
    if (idx > 0) out[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
  return out;
}

export async function removeContainer(name) {
  if (!name || typeof name !== 'string') throw new Error('Container name is required.');
  try {
    const { code, stderr } = await dockerArgs(['rm', '-f', name]);
    if (code !== 0) throw new Error(stderr || `Docker rm exit ${code}`);
    return `Container "${name}" removed.`;
  } catch (err) {
    if (noDockerError(err)) {
      throw new Error('Docker is not available on this system.');
    }
    throw err;
  }
}

export async function listContainers() {
  try {
    // Plain `docker ps` lists EVERY container on the host (n8n, qdrant,
    // sidecars — not just this repo's compose project, which is all
    // `docker compose ps` ever showed).
    const { stdout, code, stderr } = await dockerArgs(['ps', '--format', 'json']);
    if (code !== 0) throw new Error(stderr || `Docker exit ${code}`);
    const lines = stdout.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return [];

    // docker ps --format json emits one JSON object per line
    return lines.map(line => {
      try {
        const c = JSON.parse(line);
        const name = c.Names || c.Name;
        const labels = parseLabels(c.Labels);
        return {
          Name: name,
          Service: name,
          State: c.State,
          Status: c.Status,
          Ports: c.Ports,
          Image: c.Image,
          Sandbox: typeof name === 'string' && name.startsWith('homebase-sbx-'),
          HostPath: labels['homebase.hostPath'] || null,
        };
      } catch { return null; }
    }).filter(Boolean);
  } catch (err) {
    if (noDockerError(err)) {
      throw new Error('Docker is not available on this system. Make sure Docker Desktop is installed and running.');
    }
    throw err;
  }
}

export async function getContainerLogs(service, lines = 50) {
  try {
    // Plain `docker logs` takes a container NAME and works for every
    // container on the host, compose-managed or not.
    const { stdout, stderr, code } = await dockerArgs(
      ['logs', `--tail=${lines}`, service]
    );
    if (code !== 0 && code !== null) {
       throw new Error(stderr || `Docker logs exit ${code}`);
    }
    const output = (stdout + stderr).trim();
    return output || `No log output for service "${service}".`;
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error('Docker is not available on this system.');
    }
    const combined = ((err.stdout || '') + (err.stderr || '')).trim();
    throw new Error(`container_logs error for "${service}": ${combined || err.message}`);
  }
}

export async function restartContainer(service) {
  try {
    const { code, stderr } = await dockerArgs(['restart', service]);
    if (code !== 0) throw new Error(stderr || `Docker restart exit ${code}`);
    return `Container "${service}" restarted successfully.`;
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error('Docker is not available on this system.');
    }
    const combined = ((err.stdout || '') + (err.stderr || '')).trim();
    throw new Error(`restart_service error for "${service}": ${combined || err.message}`);
  }
}

export async function handleContainerTool(agentId, name, args) {
  switch (name) {
    case 'container_status': {
      try {
        const services = await listContainers();
        if (services.length === 0) return 'No containers found. Is Docker running?';

        const header = 'SERVICE'.padEnd(20) + 'STATUS'.padEnd(20) + 'PORTS';
        const divider = '-'.repeat(80);
        const rows = services.map(s => {
          const svc = (s.Service || s.Name || s.service || '').padEnd(20);
          const status = (s.Status || s.State || '').padEnd(20);
          const ports = Array.isArray(s.Publishers)
            ? s.Publishers.map(p => `${p.PublishedPort || ''}→${p.TargetPort || ''}`).join(', ')
            : (s.Ports || '');
          return svc + status + ports;
        }).join('\n');

        return `CONTAINER STATUS\n${header}\n${divider}\n${rows}`;
      } catch (err) {
        return err.message;
      }
    }

    case 'container_logs': {
      const service = args.service || 'homebase';
      const lines = args.lines || 50;
      try {
        return await getContainerLogs(service, lines);
      } catch (err) {
        return err.message;
      }
    }

    case 'restart_service': {
      const service = args.service || 'homebase';
      try {
        return await restartContainer(service);
      } catch (err) {
        return err.message;
      }
    }

    default:
      throw new Error(`Unknown container tool: ${name}`);
  }
}
