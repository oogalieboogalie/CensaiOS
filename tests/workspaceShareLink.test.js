import {
  navigateToWorkspace,
  requestedWorkspaceId,
  workspaceShareLink,
} from '../src/lib/workspace/shareLink.js';

test('workspace share links preserve the page and select one valid workspace', () => {
  expect(workspaceShareLink('workspace-a', {
    href: 'http://localhost:5173/?demo=1#old',
  })).toBe('http://localhost:5173/?demo=1&workspace=workspace-a');
  expect(requestedWorkspaceId('?demo=1&workspace=workspace-a')).toBe('workspace-a');
});

test('workspace navigation selects an explicit destination instead of the recent default', () => {
  let assigned = '';
  const locationLike = {
    href: 'http://localhost:5173/?workspace=shared-space',
    assign: (href) => { assigned = href; },
  };
  expect(navigateToWorkspace('user-7-default', locationLike)).toBe(
    'http://localhost:5173/?workspace=user-7-default',
  );
  expect(assigned).toBe('http://localhost:5173/?workspace=user-7-default');
});

test('malformed workspace selectors are ignored', () => {
  expect(requestedWorkspaceId('?workspace=../../etc')).toBeNull();
  expect(workspaceShareLink('../../etc', { href: 'http://localhost:5173/' })).toBe('');
});
