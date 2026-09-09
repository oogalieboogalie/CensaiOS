/** @jest-environment jsdom */
import {
  collaborationUrl,
  mergeCollaborationPreviews,
} from '../src/app/hooks/useWorkspaceCollaboration.js';

test('remote previews decorate render state without mutating durable windows', () => {
  const wins = [{ id: 'one', x: 1, y: 2, title: 'Draft' }];
  const rendered = mergeCollaborationPreviews(wins, {
    one: { x: 50, y: 60, actor: { id: '8', label: 'Member 8' } },
  });
  expect(rendered[0]).toMatchObject({
    id: 'one', x: 50, y: 60,
    collaborationActor: { id: '8', label: 'Member 8' },
  });
  expect(wins[0]).toEqual({ id: 'one', x: 1, y: 2, title: 'Draft' });
});

test('collaboration websocket URL stays same-origin and workspace scoped', () => {
  expect(collaborationUrl('workspace a', 'client/1')).toContain(
    '/ws/workspace-collaboration?workspaceId=workspace%20a&clientId=client%2F1'
  );
});
