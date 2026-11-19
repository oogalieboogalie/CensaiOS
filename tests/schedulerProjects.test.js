
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

describe('scheduler project menu is tidy', () => {
  const rows = [
    { id: 'wt', name: 'fix-x', path: '/home/alma/Shop-worktrees/fix-x', updatedAt: '2026-11-15T00:00:00Z' },
    { id: 'blog', name: 'Blog', path: 'D:\\Repos\\Blog', updatedAt: '2026-11-14T00:00:00Z' },
    { id: 'apple', name: 'Apple', repo: 'someone/apple', updatedAt: '2026-11-12T00:00:00Z' },
    { id: 'shop', name: 'Shop', path: 'D:\\Repos\\Shop', updatedAt: '2026-11-01T00:00:00Z' },
    { id: 'shop-2', name: 'shop', path: 'd:/repos/shop/', updatedAt: '2026-10-01T00:00:00Z' },
  ];

  test('current project first, then most recent; worktrees and same-folder rows drop out', () => {
    const options = buildSchedulerProjectOptions(rows, { projectId: 'shop', name: 'Shop', path: 'D:\\Repos\\Shop' });
    expect(options.map(o => o.value)).toEqual(['shop', 'blog', 'apple']);
  });

  test('a helper folder just added from the + stays in the menu, so it can be picked', () => {
    const added = { id: 'shared-foo', name: 'foo', path: '/home/alma/Shop-worktrees/foo', opened: true, updatedAt: '2026-11-15T01:00:00Z' };
    const options = buildSchedulerProjectOptions([added, ...rows], { projectId: 'shop', name: 'Shop', path: 'D:\\Repos\\Shop' });
    expect(options.map(o => o.value)).toEqual(['shop', 'shared-foo', 'blog', 'apple']);
  });

  test('a default project missing from the list still goes first', () => {
    const options = buildSchedulerProjectOptions(rows, { projectId: 'new', name: 'New', path: 'D:\\Repos\\New' });
    expect(options.map(o => o.value)).toEqual(['new', 'blog', 'apple', 'shop']);
  });
});
