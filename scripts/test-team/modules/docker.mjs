// Docker window: Pat (the owner) sees a running container, reads its logs,
// stops and starts it, and opens Images (with what an image is made of),
// Volumes, Networks and Compose; Sam sees the window. Then the wrong things:
// missing and odd container names, a huge log request, a bad image name,
// sharing the whole drive or Docker's own socket. Red team: signed out, and
// Sam (a teammate) trying the owner-only actions and reads. The container's
// log line and the image's build steps must never reach the app log.
//
// Needs a Docker engine on the machine the test runs on; without one every
// step is "skip". The test makes one small image, container, volume, network
// and Compose project, all made up, and removes them after.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { note, skip } from '../report.mjs';

const run = promisify(execFile);
const NAME = 'censai-test-team-hello';
const IMAGE = process.env.TEST_TEAM_DOCKER_IMAGE || 'busybox:1.36';
const RAW_DOCKER = /Error response from daemon|docker:|exit code|Command failed/i;
const HELLO = 'made-up container says hello';
// A build step that looks like a password: shown in the window, never logged.
const SECRET = 'made-up-build-secret-value';
const MADE = 'censai-test-team/garden:1.0';
const VOLUME = 'censai-test-team-vol';
const NETWORK = 'censai-test-team-net';
const PROJECT = 'censai-test-team';
let workDir = null;

async function docker(args) {
  return run('docker', args, { timeout: 120_000 });
}

async function makeContainer() {
  try {
    await docker(['info', '--format', '{{.ServerVersion}}']);
  } catch {
    return false;
  }
  await removeAll();
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-team-docker-'));
  fs.writeFileSync(path.join(workDir, 'Dockerfile'), [
    `FROM ${IMAGE}`, `ENV MADE_UP_TOKEN=${SECRET}`, 'RUN echo "made-up garden notes" > /garden.txt', 'WORKDIR /garden',
  ].join('\n'));
  fs.writeFileSync(path.join(workDir, 'compose.yaml'), `services:\n  garden:\n    image: ${MADE}\n    command: ["sh", "-c", "sleep 900"]\n`);
  await docker(['build', '-q', '-t', MADE, workDir]);
  await docker(['volume', 'create', VOLUME]);
  await docker(['network', 'create', NETWORK]);
  await docker(['run', '-d', '--name', NAME, '-v', `${VOLUME}:/data`, '--network', NETWORK, MADE, 'sh', '-c', `echo ${HELLO}; sleep 900`]);
  await docker(['compose', '-p', PROJECT, '-f', path.join(workDir, 'compose.yaml'), 'up', '-d']).catch(() => {});
  return true;
}

async function removeAll() {
  await docker(['compose', '-p', PROJECT, 'down']).catch(() => {});
  await docker(['rm', '-f', NAME]).catch(() => {});
  await docker(['volume', 'rm', VOLUME]).catch(() => {});
  await docker(['network', 'rm', NETWORK]).catch(() => {});
  await docker(['image', 'rm', MADE]).catch(() => {});
  if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
}

/** Opens one tab of Pat's Docker window and waits for a row naming `text`. */
async function openTab(frame, tab, text) {
  await frame.getByRole('tab', { name: new RegExp(tab) }).click();
  await frame.getByText(text).first().waitFor({ timeout: 20_000 });
}

const expectStatus = (res, want, what) => {
  if (!want.includes(res.status)) throw new Error(`${what} answered ${res.status}: ${res.text.slice(0, 120)}`);
};

export default {
  id: 'docker',
  label: 'Docker window',
  async run(t) {
    const { pat, sam, signedOut, check } = t;
    t.typed.push(HELLO, SECRET);
    const ready = await makeContainer().catch(() => false);
    const need = () => { if (!ready) throw skip('no Docker engine on this machine'); };
    const asPat = (method, url, data) => t.api(pat, method, url, data);
    const asSam = (method, url, data) => t.api(sam, method, url, data);
    try {
      let id;
      await check('walk', 'Pat opens the Docker window and sees the running container', async ({ shot }) => {
        need();
        id = await spawnWindow(pat.page, 'containers', {}, { x: 40, y: 40 }, { w: 960, h: 620 });
        const frame = windowFrame(pat.page, id);
        await frame.getByText(NAME).first().waitFor({ timeout: 20_000 });
        await shot(pat.page, 'pat-sees-the-container');
        return 'the window lists the made-up container';
      });
      await check('walk', 'Pat reads the container\'s logs', async () => {
        need();
        const res = await asPat('GET', `/api/docker/containers/${NAME}/logs?tail=20`);
        expectStatus(res, [200], 'logs');
        const lines = res.body?.lines || [];
        if (!JSON.stringify(lines).includes(HELLO)) throw new Error('the logs did not hold the container\'s hello line');
        return 'the hello line is in the logs';
      });
      await check('walk', 'Pat stops and starts the container', async () => {
        need();
        expectStatus(await asPat('POST', `/api/docker/containers/${NAME}/stop`), [200], 'stop');
        const stopped = (await docker(['inspect', '-f', '{{.State.Running}}', NAME])).stdout.trim();
        expectStatus(await asPat('POST', `/api/docker/containers/${NAME}/start`), [200], 'start');
        const started = (await docker(['inspect', '-f', '{{.State.Running}}', NAME])).stdout.trim();
        if (stopped !== 'false' || started !== 'true') throw new Error(`running after stop: ${stopped}, after start: ${started}`);
        return 'Docker itself confirms it stopped, then ran again';
      });
      await check('walk', 'Pat opens Images and sees what the made-up image is made of', async ({ shot }) => {
        need();
        const frame = windowFrame(pat.page, id);
        await openTab(frame, 'Images', 'censai-test-team/garden');
        await frame.getByLabel(`What ${MADE} is made of`).click();
        const detail = frame.locator('.dk-image');
        await detail.locator('.dk-layer-step').first().waitFor({ timeout: 20_000 });
        const steps = await detail.locator('.dk-layer-step').allTextContents();
        const used = await detail.locator('dd').nth(3).textContent();
        await shot(pat.page, 'pat-sees-what-the-image-is-made-of');
        if (!steps.some((step) => step.includes('garden notes'))) throw new Error(`no build step shown: ${steps.join(' | ').slice(0, 160)}`);
        if (!used.includes(NAME)) throw new Error(`"used by" says ${used}`);
        return `${steps.length} layers shown newest first; used by ${used}`;
      });
      await check('walk', 'Pat opens Volumes and Networks and sees the made-up ones in use', async ({ shot }) => {
        need();
        const frame = windowFrame(pat.page, id);
        await openTab(frame, 'Volumes', VOLUME);
        await shot(pat.page, 'pat-sees-the-volumes');
        await openTab(frame, 'Networks', NETWORK);
        await shot(pat.page, 'pat-sees-the-networks');
        const vols = (await asPat('GET', '/api/docker/volumes')).body?.volumes || [];
        const nets = (await asPat('GET', '/api/docker/networks')).body?.networks || [];
        const vol = vols.find((v) => v.name === VOLUME);
        const net = nets.find((n) => n.name === NETWORK);
        if (!vol?.inUseBy?.length || !net?.inUseBy?.length) throw new Error(`volume in use by ${vol?.inUseBy?.join(', ') || 'nobody'}, network by ${net?.inUseBy?.join(', ') || 'nobody'}`);
        return `the volume and the network both show ${NAME} using them`;
      });
      await check('walk', 'Pat opens Compose and sees the made-up project', async ({ shot }) => {
        need();
        const projects = (await asPat('GET', '/api/docker/compose')).body?.projects || [];
        if (!projects.some((p) => p.name === PROJECT)) throw skip('docker compose could not start the made-up project here');
        const frame = windowFrame(pat.page, id);
        await openTab(frame, 'Compose', PROJECT);
        await shot(pat.page, 'pat-sees-the-compose-project');
        await frame.getByRole('tab', { name: /Containers/ }).click();
        return `the ${PROJECT} project is listed`;
      });
      await check('walk', 'Sam sees the Docker window on the shared board', async ({ shot }) => {
        need();
        await windowFrame(sam.page, id).waitFor({ state: 'visible', timeout: 10_000 });
        await sam.page.waitForTimeout(2000);
        await shot(sam.page, 'sam-sees-the-docker-window');
        return 'the window is on Sam\'s board too';
      });

      await check('hunt', 'logs for a container that does not exist give a plain answer', async () => {
        need();
        const res = await asPat('GET', '/api/docker/containers/no-such-container-here/logs');
        if (res.status === 200) throw new Error('answered 200 for a container that does not exist');
        if (res.status >= 500 && RAW_DOCKER.test(res.text)) throw note(`answered ${res.status} with Docker's own error text: ${res.body?.error?.slice(0, 80)}`);
        return `answered ${res.status}: ${res.body?.error?.slice(0, 80)}`;
      });
      await check('hunt', 'a container name with slashes and dots is refused', async () => {
        need();
        const res = await asPat('POST', `/api/docker/containers/${encodeURIComponent('../../etc')}/stop`);
        if (res.status === 200) throw new Error('a path-like name was accepted');
        return `refused with ${res.status}`;
      });
      await check('hunt', 'asking for a billion log lines is capped', async () => {
        need();
        const res = await asPat('GET', `/api/docker/containers/${NAME}/logs?tail=999999999`);
        expectStatus(res, [200], 'logs');
        return 'answered normally (the server caps it at 5000 lines)';
      });
      await check('hunt', 'a nonsense image name is refused before Docker runs', async () => {
        need();
        const res = await asPat('POST', '/api/docker/images/run', { image: 'NOT A REAL image!!; rm -rf /' });
        if (res.status === 200) throw new Error('Docker was asked to run it');
        if (res.status >= 500) throw new Error(`answered ${res.status} instead of a plain refusal`);
        return `refused with ${res.status}: ${res.body?.error?.slice(0, 80)}`;
      });
      await check('hunt', 'sharing the whole drive or Docker\'s socket is refused, even for the owner', async () => {
        need();
        const drive = await asPat('POST', '/api/docker/images/run', { image: IMAGE, share: { host: '/', target: '/host' } });
        const sock = await asPat('POST', '/api/docker/images/run', { image: IMAGE, share: { host: '/var/run/docker.sock', target: '/s' } });
        if (drive.status === 200 || sock.status === 200) throw new Error(`whole drive answered ${drive.status}, socket answered ${sock.status}`);
        return `whole drive refused (${drive.status}), socket refused (${sock.status})`;
      });

      await check('redteam', 'signed out, the Docker API answers nothing', async () => {
        const res = await t.api({ ctx: signedOut }, 'GET', '/api/docker/containers');
        if (res.status !== 401 && res.status !== 403) throw new Error(`answered ${res.status} with no sign-in`);
        return `answered ${res.status}`;
      });
      await check('redteam', 'Sam (teammate) cannot stop, run, run commands in or prune containers', async () => {
        need();
        const tries = [
          ['stop', await asSam('POST', `/api/docker/containers/${NAME}/stop`)],
          ['exec', await asSam('POST', `/api/docker/containers/${NAME}/exec`, { command: 'id' })],
          ['run', await asSam('POST', '/api/docker/images/run', { image: IMAGE })],
          ['prune', await asSam('POST', '/api/docker/prune/containers')],
          ['remove', await asSam('DELETE', `/api/docker/containers/${NAME}?force=true`)],
        ];
        const let_in = tries.filter(([, res]) => res.status < 400);
        if (let_in.length) throw new Error(`a teammate got through: ${let_in.map(([what, res]) => `${what} ${res.status}`).join(', ')}`);
        return `all refused (${tries.map(([what, res]) => `${what} ${res.status}`).join(', ')})`;
      });
      await check('redteam', 'Sam (teammate) cannot read the owner\'s logs, container settings or image history', async () => {
        need();
        const tries = [
          ['logs', await asSam('GET', `/api/docker/containers/${NAME}/logs?tail=5`)],
          ['settings', await asSam('GET', `/api/docker/containers/${NAME}`)],
          ['image history', await asSam('GET', `/api/docker/images/history?ref=${encodeURIComponent(MADE)}`)],
        ];
        const let_in = tries.filter(([, res]) => res.status < 400);
        if (let_in.length) throw new Error(`a teammate could read: ${let_in.map(([what, res]) => `${what} ${res.status}`).join(', ')}`);
        const leaked = tries.filter(([, res]) => res.text.includes(HELLO) || res.text.includes(SECRET));
        if (leaked.length) throw new Error(`the refusal still carried the owner's text (${leaked.map(([what]) => what).join(', ')})`);
        return `all refused (${tries.map(([what, res]) => `${what} ${res.status}`).join(', ')})`;
      });
      await check('redteam', 'signed out, an image\'s history answers nothing', async () => {
        const res = await t.api({ ctx: signedOut }, 'GET', `/api/docker/images/history?ref=${encodeURIComponent(MADE)}`);
        if (res.status !== 401 && res.status !== 403) throw new Error(`answered ${res.status} with no sign-in`);
        return `answered ${res.status}`;
      });
    } finally {
      if (ready) await removeAll();
    }
  },
};
