// Docker-only mode for the runner (RUNNER_DOCKER_ONLY=true). The runner is
// the one service that holds the Docker socket; in this mode it runs nothing
// but `docker`, and refuses the ways a container (or a misbehaving agent that
// can reach the runner) could take over the computer or censaiOS itself:
// privileged containers, sharing the host's network or processes, mounting
// anything outside the projects folder or censaiOS's own data, publishing a
// port beyond this computer, shelling into a container censaiOS did not
// start, and stopping or deleting censaiOS's own containers and data.
// Every refusal is { code, why }: the code goes to the log, `why` to the caller.

import os from 'os';
import { RUN_FLAGS, EXEC_FLAGS, readOptions, isOn } from './dockerFlags.js';
import { badMountSource, mountRefusal, volumeFlagMount, mountFlagMount, isStackVolume } from './dockerMounts.js';

export { badMountSource };

const refuse = (code, why) => ({ code, why });

const TOP = new Set([
  'ps', 'info', 'version', 'stats', 'inspect', 'logs', 'exec', 'start', 'stop', 'restart', 'pause', 'unpause', 'kill',
  'rm', 'images', 'pull', 'rmi', 'port', 'top', 'run', 'create', 'system', 'image', 'volume', 'network', 'container', 'compose',
]);
const GROUPS = {
  system: new Set(['df', 'info']),
  image: new Set(['ls', 'list', 'inspect', 'history', 'pull', 'rm']),
  volume: new Set(['ls', 'list', 'inspect', 'create', 'rm']),
  network: new Set(['ls', 'list', 'inspect', 'create', 'rm']),
  container: new Set(['ls', 'list', 'ps', 'inspect', 'logs', 'stats', 'top', 'port', 'start', 'stop', 'restart', 'pause',
    'unpause', 'kill', 'rm', 'exec', 'run', 'create']),
};
const BANNED = new Set([
  'privileged', 'cap-add', 'device', 'security-opt', 'pid', 'ipc', 'uts', 'userns', 'cgroupns', 'cgroup-parent',
  'volumes-from', 'device-cgroup-rule', 'add-host', 'use-api-socket', 'volume-driver', 'env-file', 'label-file',
  'cidfile', 'publish-all', 'link', 'runtime',
]);
const LOCAL_PUBLISH = /^(127\.0\.0\.1|\[::1\]):/;
const COMPOSE_VALUE = new Set(['-p', '--project-name', '-f', '--file', '--project-directory', '--env-file', '--profile', '--ansi', '--progress', '--parallel']);
const COMPOSE_READ = new Set(['ls', 'ps', 'logs', 'top', 'images', 'version']);
const COMPOSE_CHANGE = new Set(['start', 'stop', 'restart', 'down', 'pull', 'pause', 'unpause', 'kill', 'rm']);
export const RUNNER_LABEL = 'censai.runner';
// Containers censaiOS starts carry one of these; only they can be entered.
const RUNNER_MADE = [RUNNER_LABEL, 'censai.devserver', 'homebase.sandbox'];
const STACK_GUARDED = new Set(['stop', 'restart', 'pause', 'kill', 'rm']);
const TARGET_VALUE = new Set(['-t', '--time', '--timeout', '-s', '--signal', '--platform']);

/** `container stop x` -> stop x, `image rm x` -> rmi x, `volume rm x` -> "volume rm" x. */
function normalize(list) {
  const [sub, ...rest] = list;
  if (!GROUPS[sub]) return { verb: sub, rest };
  const [inner, ...tail] = rest;
  if (!GROUPS[sub].has(inner)) return { verb: null, rest: tail };
  if (sub === 'container') return { verb: inner === 'ls' || inner === 'list' ? 'ps' : inner, rest: tail };
  if (sub === 'image' && inner === 'rm') return { verb: 'rmi', rest: tail };
  return { verb: `${sub} ${inner}`, rest: tail };
}

const positionals = (rest) => {
  const out = [];
  for (let i = 0; i < rest.length; i++) {
    if (TARGET_VALUE.has(rest[i])) { i += 1; continue; }
    if (!rest[i].startsWith('-')) out.push(rest[i]);
  }
  return out;
};

// Only these flags: true = takes any value, false = none, a string = only that value.
function onlyFlags(rest, allowed) {
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('-')) continue;
    const eq = a.indexOf('=');
    const flag = eq < 0 ? a : a.slice(0, eq);
    if (!(flag in allowed)) return false;
    const rule = allowed[flag];
    if (rule === false) { if (eq >= 0) return false; continue; }
    const value = eq < 0 ? rest[++i] : a.slice(eq + 1);
    if (typeof rule === 'string' && value !== rule) return false;
  }
  return true;
}

function runRefusal(rest, facts) {
  const { opts, error } = readOptions(rest, RUN_FLAGS);
  if (error) return refuse('unknown-flag', 'an option the gatekeeper does not know is not allowed');
  for (const o of opts) {
    if (BANNED.has(o.name) && (RUN_FLAGS.value.has(o.name) || isOn(o))) return refuse('banned-flag', `--${o.name} is not allowed`);
    if (o.name === 'network') {
      const v = String(o.value);
      if (v === 'host' || v.startsWith('container:')) return refuse('banned-network', `--network ${v} is not allowed`);
      if (facts.networks?.has(v) || (facts.project && v.toLowerCase().startsWith(`${facts.project.toLowerCase()}_`))) {
        return refuse('stack-network', "joining censaiOS's own network is not allowed");
      }
    }
    if (o.name === 'label' && /^com\.docker\.compose\./i.test(o.value)) return refuse('banned-flag', 'compose labels are not allowed');
    if (o.name === 'publish' && !LOCAL_PUBLISH.test(o.value)) return refuse('publish-not-local', 'ports can only be published to this computer (127.0.0.1)');
    const mount = o.name === 'volume' ? volumeFlagMount(o.value) : o.name === 'mount' ? mountFlagMount(o.value) : null;
    const why = mountRefusal(mount, facts);
    if (why) return why;
  }
  return null;
}

function composeRefusal(rest, facts) {
  let project = null;
  let verb = null;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const [flag, inline] = a.startsWith('--') && a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    if (COMPOSE_VALUE.has(flag)) {
      const value = inline ?? rest[++i];
      if (flag === '-p' || flag === '--project-name') project = String(value || '');
      continue;
    }
    if (a.startsWith('-')) return refuse('unknown-flag', 'an option the gatekeeper does not know is not allowed');
    verb = a;
    break;
  }
  if (verb === 'up') return refuse('compose-verb', 'docker compose up is not allowed from censaiOS');
  if (COMPOSE_READ.has(verb)) return null;
  if (!COMPOSE_CHANGE.has(verb)) return refuse('compose-verb', `docker compose ${verb || ''} is not allowed`.trim());
  if (!project) return refuse('compose-no-project', 'name the compose project with -p');
  if (facts.project && project.toLowerCase() === facts.project.toLowerCase()) {
    return refuse('stack-target', "censaiOS's own containers can't be stopped or removed from here");
  }
  return null;
}

/** Why this call is refused, as { code, why }, or null when it may run (after the target checks). */
export function dockerOnlyCheck(command, args = [], facts = {}) {
  if (command !== 'docker') return refuse('not-docker', 'only docker commands run here');
  const list = (args || []).map(String);
  if (!list.length) return refuse('subcommand', 'docker needs a command');
  if (list[0].startsWith('-')) return refuse('global-flag', 'options before the docker command (like --host) are not allowed');
  // Every `<noun> prune` (system, volume, image, network, container, builder,
  // buildx...) deletes in bulk, so all of them are refused by their shape.
  if (list[1] === 'prune') return refuse('destructive', 'prune commands delete in bulk and are not allowed from censaiOS');
  if (!TOP.has(list[0])) return refuse('subcommand', `docker ${list[0]} is not allowed`);
  const { verb, rest } = normalize(list);
  if (!verb) return refuse('subcommand', `docker ${list[0]} ${list[1] || ''} is not allowed`.trim());
  if (verb === 'run' || verb === 'create') return runRefusal(rest, facts);
  if (verb === 'compose') return composeRefusal(rest, facts);
  if (verb === 'exec') {
    const { opts, at, error } = readOptions(rest, EXEC_FLAGS);
    if (error) return refuse('unknown-flag', 'an option the gatekeeper does not know is not allowed');
    const banned = opts.find((o) => (o.name === 'privileged' && isOn(o)) || o.name === 'env-file');
    if (banned) return refuse('banned-flag', `--${banned.name} is not allowed`);
    if (at >= rest.length) return refuse('exec-target', 'docker exec needs a container');
    return null;
  }
  if (verb === 'volume create' && !onlyFlags(rest, { '--label': true, '--name': true })) {
    return refuse('volume-options', 'volume driver options are not allowed');
  }
  if (verb === 'network create' && !onlyFlags(rest, { '--label': true, '--internal': false, '--attachable': false, '--driver': 'bridge', '-d': 'bridge' })) {
    return refuse('network-options', 'only plain bridge networks can be made here');
  }
  if (verb === 'volume rm' && positionals(rest).some((v) => isStackVolume(v, facts))) {
    return refuse('stack-volume', "censaiOS's own data volumes can't be removed from here");
  }
  return null;
}

/** Legacy shape: the reason text, or null. */
export const dockerOnlyViolation = (command, args, facts) => dockerOnlyCheck(command, args, facts)?.why ?? null;

/** Which containers or images the call acts on, for the checks that need `docker inspect`. */
export function targetPlan(args = []) {
  const list = (args || []).map(String);
  const { verb, rest } = normalize(list);
  if (verb === 'exec') {
    const { at } = readOptions(rest, EXEC_FLAGS);
    return rest[at] ? { kind: 'exec', targets: [rest[at]] } : null;
  }
  if (STACK_GUARDED.has(verb)) return { kind: 'stack', targets: positionals(rest) };
  if (verb === 'rmi') return { kind: 'image', targets: positionals(rest) };
  return null;
}

/** The container `docker exec` targets. */
export const execTarget = (args = []) => {
  const plan = targetPlan(args);
  return plan?.kind === 'exec' ? plan.targets[0] : null;
};

/** A container censaiOS itself runs: its compose project, its socket, its data. */
export function isStackContainer(c, facts = {}) {
  const labels = c?.Config?.Labels || {};
  if (facts.project && labels['com.docker.compose.project'] === facts.project) return true;
  if (facts.containers?.has(c?.Id) || facts.containers?.has(String(c?.Name || '').replace(/^\//, ''))) return true;
  return (c?.Mounts || []).some((m) => (m.Type === 'volume' && m.Name && isStackVolume(m.Name, facts))
    || String(m.Source || '').toLowerCase().includes('docker.sock'));
}

export const isRunnerMade = (c) => RUNNER_MADE.some((l) => c?.Config?.Labels?.[l] === '1');

/** A container that holds the socket, runs privileged or reaches past the projects folder is off limits to exec. */
export function inspectViolation(inspectJson, facts = null) {
  let info;
  try { info = JSON.parse(inspectJson); } catch { return 'that container could not be checked'; }
  const c = Array.isArray(info) ? info[0] : info;
  if (!c) return 'that container could not be checked';
  if (c.HostConfig?.Privileged) return 'that container is privileged';
  const binds = (c.Mounts || []).filter((m) => m.Type !== 'volume');
  if (binds.some((m) => badMountSource(m.Source))) return 'that container can reach the Docker socket or the whole computer';
  if (facts && binds.some((m) => mountRefusal({ type: 'bind', source: m.Source }, facts))) return 'that container reaches outside the projects folder';
  return null;
}

/**
 * `docker run|create` with censaiOS's label and, unless the call set its
 * own, a memory and CPU ceiling, so one container can't starve the computer.
 */
export function withRunnerDefaults(args = [], env = process.env) {
  const list = (args || []).map(String);
  const at = list[0] === 'container' ? 1 : 0;
  if (list[at] !== 'run' && list[at] !== 'create') return list;
  const { opts } = readOptions(list.slice(at + 1), RUN_FLAGS);
  const has = (...names) => opts.some((o) => names.includes(o.name));
  const extra = ['--label', `${RUNNER_LABEL}=1`];
  if (!has('memory')) extra.push('--memory', env.RUNNER_CONTAINER_MEMORY || '4g');
  if (!has('cpus', 'cpu-quota', 'cpu-period', 'cpuset-cpus')) {
    extra.push('--cpus', env.RUNNER_CONTAINER_CPUS || String(Math.max(1, Math.min(2, os.cpus().length || 1))));
  }
  return [...list.slice(0, at + 1), ...extra, ...list.slice(at + 1)];
}
