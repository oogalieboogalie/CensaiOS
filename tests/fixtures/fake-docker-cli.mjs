#!/usr/bin/env node
// Drop-in `docker` binary for offline demos: symlink or wrap it as `docker`
// on PATH and the Docker window runs against canned data. State persists in
// FAKE_DOCKER_STATE (default: a file in the OS temp dir) between calls.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFakeDocker } from './dockerFake.js';

const statePath = process.env.FAKE_DOCKER_STATE || path.join(os.tmpdir(), 'homebase-fake-docker.json');
let state;
let before = '';
try { before = fs.readFileSync(statePath, 'utf8'); state = JSON.parse(before); } catch { state = undefined; }
const fake = createFakeDocker({ daemon: process.env.FAKE_DOCKER_DAEMON || 'up', state, live: process.env.FAKE_DOCKER_LIVE !== '0' });
const { stdout, stderr, code } = fake.exec('docker', process.argv.slice(2));
// Only a call that changed something writes, so the window's steady polling
// (list, stats) can't put back an older state over a Run that just landed.
const after = JSON.stringify(fake.state);
if (after !== before) fs.writeFileSync(statePath, after);
if (stdout) process.stdout.write(stdout);
if (stderr) process.stderr.write(stderr);
process.exit(typeof code === 'number' ? code : 1);
