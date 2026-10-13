import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { docker, assertRef, parseJsonLines, parseLabels, DockerInputError } from '../docker/cli.js';
import { cleanFolderPath, toEngineFolder } from './hostPath.js';

// Run dev: one throwaway container per project folder, used only to run that
// project's dev server. The folder is mounted at /app, packages live in a
// per-project volume (so Windows node_modules never meet Linux), and the dev
// server's port is published on 127.0.0.1 at a port Docker picks. Removing
// the container is all "Stop" needs to do.

export const LABEL = 'censai.devserver';
export const DEFAULT_IMAGE = process.env.CENSAI_DEV_IMAGE || 'node:22-bookworm-slim';
export const DEFAULT_PORT = 3000;
const LAUNCHER = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'launcher.cjs'), 'utf8');
const LAUNCH_B64 = Buffer.from(LAUNCHER).toString('base64');
const BOOT = "eval(Buffer.from(process.env.CENSAI_LAUNCH,'base64').toString())";

// name -> { phase, message, folder, startedAt, ready }
const phases = new Map();

export function projectKey(folder) {
  return crypto.createHash('sha1').update(folder.replace(/\\/g, '/').toLowerCase()).digest('hex').slice(0, 10);
}

export function containerName(folder) {
  const base = folder.split(/[\\/]/).filter(Boolean).pop() || 'project';
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'project';
  return `censai-dev-${slug}-${projectKey(folder)}`;
}

export function cleanCommand(raw) {
  const cmd = String(raw ?? '').trim();
  if (cmd.length > 300 || /[\0\r\n]/.test(cmd)) throw new DockerInputError('Keep the command on one line, under 300 characters.');
  return cmd;
}

export function cleanPort(raw) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_PORT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new DockerInputError('The port must be a number from 1 to 65535.');
  return n;
}

export function runArgs({ name, folder, engineFolder, image, command, port }) {
  return [
    'run', '-d', '--name', name,
    '--label', `${LABEL}=1`, '--label', `${LABEL}.folder=${folder}`, '--label', `${LABEL}.port=${port}`,
    '--mount', `type=bind,source=${engineFolder},target=/app`,
    '--mount', `type=volume,source=censai-dev-packages-${projectKey(folder)},target=/app/node_modules`,
    '-p', `127.0.0.1::${port}`,
    '-e', `PORT=${port}`, '-e', 'HOST=0.0.0.0', '-e', 'BROWSER=none',
    // Bind mounts from Windows don't deliver file-change events; poll instead.
    '-e', 'CHOKIDAR_USEPOLLING=true', '-e', 'WATCHPACK_POLLING=true',
    '-e', `CENSAI_DEV_CMD=${command}`, '-e', `CENSAI_LAUNCH=${LAUNCH_B64}`,
    '-w', '/app', image, 'node', '-e', BOOT,
  ];
}

export function parseHostPort(ports, port) {
  const m = String(ports || '').match(new RegExp(`(?:[\\d.]+|\\[::1?\\]):(\\d+)->${port}/tcp`));
  return m ? Number(m[1]) : null;
}

async function ensureImage(name, image) {
  try {
    await docker(['image', 'inspect', image], { timeout: 15_000 });
  } catch (err) {
    if (err.name === 'DockerUnavailableError') throw err;
    phases.set(name, { ...phases.get(name), phase: 'pulling', message: `Downloading ${image} (first run only)` });
    await docker(['pull', image], { timeout: 15 * 60_000 });
  }
}

async function launch(name, opts) {
  try {
    await docker(['rm', '-f', name], { timeout: 30_000 }).catch(() => {});
    await ensureImage(name, opts.image);
    phases.set(name, { ...phases.get(name), phase: 'starting', message: 'Starting the container' });
    await docker(runArgs({ name, ...opts }), { timeout: 60_000 });
    phases.set(name, { ...phases.get(name), phase: 'running', message: null });
  } catch (err) {
    phases.set(name, { ...phases.get(name), phase: 'error', message: err.message, reason: err.reason || null });
  }
}

/** Starts in the background and answers at once; poll status(name). */
export async function startDevServer({ folder: rawFolder, command, image, port } = {}) {
  const folder = cleanFolderPath(rawFolder);
  const opts = {
    folder,
    engineFolder: await toEngineFolder(folder),
    command: cleanCommand(command),
    image: assertRef(String(image || '').trim() || DEFAULT_IMAGE, 'image'),
    port: cleanPort(port),
  };
  const name = containerName(folder);
  phases.set(name, { phase: 'preparing', message: 'Getting ready', folder, startedAt: Date.now(), ready: false });
  launch(name, opts);
  return { name, folder, image: opts.image, port: opts.port };
}

export async function listDevServers() {
  const { stdout } = await docker(['ps', '-a', '--filter', `label=${LABEL}=1`, '--format', 'json']);
  return parseJsonLines(stdout).map((c) => {
    const labels = parseLabels(c.Labels);
    const port = Number(labels[`${LABEL}.port`]) || DEFAULT_PORT;
    const hostPort = parseHostPort(c.Ports, port);
    return {
      name: String(c.Names || '').split(',')[0],
      folder: labels[`${LABEL}.folder`] || '',
      state: c.State,
      status: c.Status,
      port,
      hostPort,
      url: hostPort ? `http://localhost:${hostPort}` : null,
    };
  });
}

// Ask from inside the container: works no matter where Homebase itself runs.
async function answers(name, port) {
  const probe = `fetch('http://127.0.0.1:${port}/').then(()=>process.exit(0),()=>process.exit(1))`;
  try {
    await docker(['exec', name, 'node', '-e', probe], { timeout: 8_000 });
    return true;
  } catch {
    return false;
  }
}

export async function devServerStatus(name) {
  assertRef(name, 'dev server');
  const note = phases.get(name);
  if (note && ['preparing', 'pulling', 'starting', 'error'].includes(note.phase)) {
    return { name, phase: note.phase, message: note.message, reason: note.reason || null, folder: note.folder };
  }
  const found = (await listDevServers()).find((s) => s.name === name);
  if (!found) return { name, phase: 'stopped', message: null };
  if (found.state !== 'running') {
    return { ...found, phase: 'exited', message: 'The dev server stopped. Its last lines are in the log below.' };
  }
  let ready = Boolean(note?.ready);
  if (!ready && (ready = await answers(name, found.port))) phases.set(name, { ...(note || {}), phase: 'running', ready: true });
  return { ...found, phase: ready ? 'ready' : 'installing', message: ready ? null : 'Installing packages and starting the dev server' };
}

export async function stopDevServer(name) {
  assertRef(name, 'dev server');
  if (!name.startsWith('censai-dev-')) throw new DockerInputError('Only Run dev containers can be stopped here.');
  phases.delete(name);
  await docker(['rm', '-f', name], { timeout: 60_000 }).catch((err) => {
    if (!/No such container/i.test(err.message)) throw err;
  });
  return { ok: true, name };
}

export function forgetPhase(name) { phases.delete(name); }
