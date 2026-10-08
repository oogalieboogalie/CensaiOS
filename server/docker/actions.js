import { docker, assertRef, DockerInputError } from './cli.js';
import { listComposeProjects } from './engine.js';

// Write side of the Docker manager. Every verb is allowlisted and every
// target goes through assertRef, so nothing user-typed reaches the CLI as a
// flag. Exec runs inside the container (`sh -c`), never in a host shell.

const CONTAINER_ACTIONS = {
  start: ['start'],
  stop: ['stop'],
  restart: ['restart'],
  pause: ['pause'],
  unpause: ['unpause'],
  kill: ['kill'],
};

export async function containerAction(id, action) {
  const verb = CONTAINER_ACTIONS[action];
  if (!verb) throw new DockerInputError(`Unknown container action: ${action}`);
  assertRef(id, 'container');
  await docker([...verb, id], { timeout: 60_000 });
  return { ok: true, id, action };
}

export async function removeContainer(id, { force = false, volumes = false } = {}) {
  assertRef(id, 'container');
  const args = ['rm'];
  if (force) args.push('-f');
  if (volumes) args.push('-v');
  await docker([...args, id], { timeout: 60_000 });
  return { ok: true, id };
}

// Split a command line into argv, honouring simple single/double quotes.
export function tokenize(command) {
  const out = [];
  let cur = '';
  let quote = null;
  let started = false;
  for (const ch of String(command)) {
    if (quote) {
      if (ch === quote) quote = null; else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch; started = true;
    } else if (/\s/.test(ch)) {
      if (started || cur) { out.push(cur); cur = ''; started = false; }
    } else {
      cur += ch;
    }
  }
  if (quote) throw new DockerInputError('Unclosed quote in command.');
  if (started || cur) out.push(cur);
  return out;
}

export async function execInContainer(id, command, { platformIsWindows = process.platform === 'win32' } = {}) {
  assertRef(id, 'container');
  const cmd = String(command || '').trim();
  if (!cmd) throw new DockerInputError('Type a command to run.');
  if (cmd.length > 2000) throw new DockerInputError('Command is too long.');
  // On POSIX hosts the whole line goes to the container's own shell. The
  // Windows runner joins argv through cmd.exe, so there we pass plain argv.
  const argv = platformIsWindows ? tokenize(cmd) : ['sh', '-c', cmd];
  const started = Date.now();
  try {
    const { stdout, stderr } = await docker(['exec', id, ...argv], { timeout: 60_000 });
    return { ok: true, exitCode: 0, stdout, stderr, durationMs: Date.now() - started };
  } catch (err) {
    if (err.status) throw err;
    return { ok: false, exitCode: 1, stdout: '', stderr: err.message, durationMs: Date.now() - started };
  }
}

export async function removeImage(id, { force = false } = {}) {
  assertRef(id, 'image');
  await docker(force ? ['image', 'rm', '-f', id] : ['image', 'rm', id], { timeout: 120_000 });
  return { ok: true, id };
}

export async function pullImage(ref) {
  assertRef(ref, 'image reference');
  const { stdout } = await docker(['pull', '--quiet', ref], { timeout: 15 * 60_000 });
  return { ok: true, ref, digest: stdout.trim() };
}

export async function removeVolume(name) {
  assertRef(name, 'volume');
  await docker(['volume', 'rm', name]);
  return { ok: true, name };
}

export async function removeNetwork(name) {
  assertRef(name, 'network');
  await docker(['network', 'rm', name]);
  return { ok: true, name };
}

const PRUNE_TARGETS = {
  containers: ['container', 'prune', '-f'],
  images: ['image', 'prune', '-f'],
  volumes: ['volume', 'prune', '-f'],
  networks: ['network', 'prune', '-f'],
};

export async function prune(target) {
  const args = PRUNE_TARGETS[target];
  if (!args) throw new DockerInputError(`Unknown prune target: ${target}`);
  const { stdout } = await docker(args, { timeout: 5 * 60_000 });
  const reclaimed = stdout.match(/Total reclaimed space:\s*(.+)/i)?.[1]?.trim() || '0B';
  return { ok: true, target, reclaimed };
}

const COMPOSE_ACTIONS = {
  up: ['up', '-d'],
  down: ['down'],
  stop: ['stop'],
  start: ['start'],
  restart: ['restart'],
  pull: ['pull'],
};

export async function composeAction(project, action) {
  const verb = COMPOSE_ACTIONS[action];
  if (!verb) throw new DockerInputError(`Unknown compose action: ${action}`);
  assertRef(project, 'compose project');
  const projects = await listComposeProjects();
  const match = projects.find((p) => p.name === project);
  if (!match) throw new DockerInputError(`No compose project named ${project}.`);
  if (action === 'up' && match.configFiles.length === 0) {
    throw new DockerInputError(`Docker doesn't know where ${project}'s compose file lives, so it can't bring it up from here.`);
  }
  const files = match.configFiles.flatMap((f) => ['-f', f]);
  const { stdout, stderr } = await docker(['compose', '-p', project, ...files, ...verb], { timeout: 10 * 60_000 });
  return { ok: true, project, action, output: `${stdout}${stderr}`.trim() };
}
