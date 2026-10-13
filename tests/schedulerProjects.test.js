/* eslint-env jest */

import { buildSchedulerProjectOptions, getSchedulerProjectReference } from '../src/components/schedulerProjects.js';

describe('scheduler project helpers', () => {
  test('merges shared projects with the current local project without duplicates', () => {
    const options = buildSchedulerProjectOptions(
      [
        { id: 'shared-demo', name: 'Demo', path: 'C:\\Projects\\Demo' },
        { id: 'demo-repo', name: 'Demo Repo', repo: 'owner/demo' },
      ],
      { projectId: 'shared-demo', name: 'Demo', path: 'C:\\Projects\\Demo' }
    );

    expect(options).toHaveLength(2);
    expect(options[0]).toEqual(expect.objectContaining({
      name: 'Demo',
      path: 'C:\\Projects\\Demo',
      value: 'shared-demo',
    }));
    expect(options[1]).toEqual(expect.objectContaining({
      name: 'Demo Repo',
      repo: 'owner/demo',
      value: 'demo-repo',
    }));
  });

  test('prefers explicit project references for scheduled handoff resolution', () => {
    expect(getSchedulerProjectReference({
      projectRef: 'shared-demo',
      projectName: 'Demo',
      projectPath: 'C:\\Projects\\Demo',
    })).toBe('shared-demo');

    expect(getSchedulerProjectReference({
      repo: 'owner/demo',
      name: 'Demo Repo',
    })).toBe('owner/demo');
  });
});
