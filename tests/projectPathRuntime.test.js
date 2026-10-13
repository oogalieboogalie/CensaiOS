import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  mapProjectPathForRuntime,
  normalizeProjectPathForStorage,
  resolveProjectPathForRuntime,
} from '../server/workspaces/shared.js';
import { assertDirectory, inferProjectName } from '../server/routes/projects/shared.js';
import { resolveProjectTargetPath } from '../server/routes/files/pathUtils.js';

describe('portable project paths', () => {
  let tempRoot;
  let previousHostRoot;
  let previousContainerRoot;

  beforeEach(async () => {
    previousHostRoot = process.env.HOMEBASE_HOST_PROJECT_ROOT;
    previousContainerRoot = process.env.HOMEBASE_CONTAINER_PROJECT_ROOT;
    tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'censai-path-'));
  });

  afterEach(async () => {
    if (previousHostRoot === undefined) delete process.env.HOMEBASE_HOST_PROJECT_ROOT;
    else process.env.HOMEBASE_HOST_PROJECT_ROOT = previousHostRoot;
    if (previousContainerRoot === undefined) delete process.env.HOMEBASE_CONTAINER_PROJECT_ROOT;
    else process.env.HOMEBASE_CONTAINER_PROJECT_ROOT = previousContainerRoot;
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
  });

  test('keeps a Windows host path as durable identity while mapping its checkout by basename', async () => {
    const containerRoot = path.join(tempRoot, 'CensaiHub');
    await fs.promises.mkdir(containerRoot);
    delete process.env.HOMEBASE_HOST_PROJECT_ROOT;
    process.env.HOMEBASE_CONTAINER_PROJECT_ROOT = containerRoot;

    const hostPath = 'C:\\Homebase\\CensaiHub';
    expect(normalizeProjectPathForStorage(hostPath)).toBe(hostPath);
    expect(mapProjectPathForRuntime(hostPath)).toBe(containerRoot.replace(/\\/g, '/'));
    expect(resolveProjectPathForRuntime(hostPath)).toBe(path.resolve(containerRoot));
    expect(resolveProjectTargetPath(`${hostPath}\\server\\index.js`, hostPath))
      .toBe(path.resolve(containerRoot, 'server', 'index.js'));
    await expect(assertDirectory(hostPath)).resolves.toBe(hostPath);
    expect(inferProjectName(hostPath)).toBe('CensaiHub');
  });

  test('uses explicit roots to map an authorized nested host path', async () => {
    const containerRoot = path.join(tempRoot, 'workspace');
    const nestedRuntimePath = path.join(containerRoot, 'packages', 'ui');
    await fs.promises.mkdir(nestedRuntimePath, { recursive: true });
    process.env.HOMEBASE_HOST_PROJECT_ROOT = 'D:\\Products\\DreamMachine';
    process.env.HOMEBASE_CONTAINER_PROJECT_ROOT = containerRoot;

    const hostPath = 'D:\\Products\\DreamMachine\\packages\\ui';
    expect(resolveProjectPathForRuntime(hostPath)).toBe(path.resolve(nestedRuntimePath));
    await expect(assertDirectory(hostPath)).resolves.toBe(hostPath);
  });
});
