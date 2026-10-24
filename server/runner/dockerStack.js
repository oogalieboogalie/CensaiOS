import os from 'os';
import { canonicalHostPath, linkEscapes, volumeFlagMount, mountFlagMount } from './dockerMounts.js';
import { RUN_FLAGS, readOptions } from './dockerFlags.js';
import { dockerOnlyCheck, targetPlan, isStackContainer, isRunnerMade, inspectViolation } from './dockerOnly.js';

// What the runner knows about the censaiOS stack it belongs to, read from
// Docker itself: its compose project, the projects folder (the runner sees
// it read-only at /workspace/projects, so links out of it can be followed),
// censaiOS's own folder, and the stack's containers, volumes, networks and
// images. Then the checks that need `docker inspect`, which fail closed.

const MIRROR = '/workspace/projects';
const APP_FOLDER = '/workspace/CensaiHub';
const CACHE_MS = 30_000;
const refuse = (code, why) => ({ code, why });

function emptyFacts(env) {
  const roots = String(env.RUNNER_PROJECTS_ROOT || '').split(/[;,]/).map((r) => r.trim()).filter(Boolean)
    .map((r) => canonicalHostPath(r)).filter(Boolean);
  return {
    project: null, projectsRoots: roots, blockedFolders: [], projectsMirror: null, cwd: process.cwd(),
    containers: new Set(), volumes: new Set(), networks: new Set(), images: new Set(),
  };
}

const pushOnce = (list, value) => { if (value && !list.includes(value)) list.push(value); };

function addContainer(facts, c, trusted) {
  if (!c) return;
  facts.containers.add(c.Id);
  facts.containers.add(String(c.Id || '').slice(0, 12));
  facts.containers.add(String(c.Name || '').replace(/^\//, ''));
  if (c.Config?.Image) facts.images.add(c.Config.Image);
  if (c.Image) facts.images.add(c.Image);
  for (const net of Object.keys(c.NetworkSettings?.Networks || {})) {
    if (!['bridge', 'host', 'none'].includes(net)) facts.networks.add(net);
  }
  for (const m of c.Mounts || []) {
    if (m.Type === 'volume' && m.Name) facts.volumes.add(m.Name);
    if (m.Type !== 'bind') continue;
    if (m.Destination === APP_FOLDER) pushOnce(facts.blockedFolders, canonicalHostPath(m.Source));
    if (m.Destination === MIRROR && trusted) pushOnce(facts.projectsRoots, canonicalHostPath(m.Source));
  }
}

/** Reads the stack through `run(args) -> stdout`. Never throws. */
export async function discoverStack(run, { env = process.env, hostname = os.hostname() } = {}) {
  const facts = emptyFacts(env);
  let self;
  try { [self] = JSON.parse(await run(['inspect', '--type', 'container', hostname])); } catch { return facts; }
  if (!self) return facts;
  addContainer(facts, self, true);
  if ((self.Mounts || []).some((m) => m.Type === 'bind' && m.Destination === MIRROR)) facts.projectsMirror = { local: MIRROR };
  facts.project = self.Config?.Labels?.['com.docker.compose.project'] || null;
  if (!facts.project) return facts;
  try {
    const ids = (await run(['ps', '-a', '-q', '--no-trunc', '--filter', `label=com.docker.compose.project=${facts.project}`]))
      .split(/\s+/).filter(Boolean);
    if (ids.length) {
      for (const c of JSON.parse(await run(['inspect', '--type', 'container', ...ids]))) {
        addContainer(facts, c, c.Config?.Labels?.['com.docker.compose.service'] === 'homebase');
      }
    }
  } catch { /* the runner's own view is still enough to protect it */ }
  return facts;
}

/** discoverStack, remembered for half a minute. */
export function cachedStack(run, options) {
  let at = 0;
  let pending = null;
  return () => {
    if (!pending || Date.now() - at > CACHE_MS) {
      at = Date.now();
      pending = discoverStack(run, options);
    }
    return pending;
  };
}

async function inspectOne(run, target) {
  try { return JSON.parse(await run(['inspect', '--type', 'container', target]))?.[0] || null; } catch { return null; }
}

function isStackImage(target, facts) {
  const t = String(target).toLowerCase();
  if (facts.project && t.startsWith(`${facts.project.toLowerCase()}-`)) return true;
  return [...facts.images].some((i) => {
    const img = String(i).toLowerCase();
    return img === t || img === `${t}:latest` || (/^[0-9a-f]{6,}$/.test(t) && img.startsWith(`sha256:${t}`)) || img === `sha256:${t}`;
  });
}

/** The checks on the containers or images a call acts on. Fails closed. */
export async function targetRefusal(args, facts, run) {
  const plan = targetPlan(args);
  if (!plan) return null;
  for (const t of plan.targets) {
    if (plan.kind === 'image') {
      if (isStackImage(t, facts)) return refuse('stack-image', "censaiOS's own images can't be removed from here");
      continue;
    }
    const c = await inspectOne(run, t);
    if (!c) return refuse('inspect-failed', 'that container could not be checked');
    if (isStackContainer(c, facts)) return refuse('stack-target', "censaiOS's own containers can't be stopped, removed or entered from here");
    if (plan.kind !== 'exec') continue;
    if (!isRunnerMade(c)) return refuse('exec-not-runner-container', 'docker exec only works on containers censaiOS started');
    const why = inspectViolation(JSON.stringify([c]), facts);
    if (why) return refuse('exec-unsafe-container', why);
  }
  return null;
}

/** A bind source that passes the path check but links out of the projects folder. */
function linkRefusal(args, facts) {
  const list = (args || []).map(String);
  const at = list[0] === 'container' ? 1 : 0;
  if (list[at] !== 'run' && list[at] !== 'create') return null;
  const { opts } = readOptions(list.slice(at + 1), RUN_FLAGS);
  for (const o of opts) {
    const m = o.name === 'volume' ? volumeFlagMount(o.value) : o.name === 'mount' ? mountFlagMount(o.value) : null;
    if (m?.type === 'bind' && linkEscapes(m.source, facts)) {
      return refuse('mount-link-escape', 'that folder links outside the projects folder');
    }
  }
  return null;
}

/** Everything the gate checks, in order: the arguments, links, then the targets. */
export async function gateRefusal(command, args, facts, run) {
  return dockerOnlyCheck(command, args, facts)
    || linkRefusal(args, facts)
    || targetRefusal(args, facts, run);
}
