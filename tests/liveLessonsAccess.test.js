import { jest } from '@jest/globals';

const links = {
  seat: { id: 'seat-link', workspace_id: 'class-ab-seat', workspace_name: 'Agents · Sam', role: 'edit', mode: 'link', scope_kind: 'board', revoked_at: null },
  teach: { id: 'teach-link', workspace_id: 'lesson-board', workspace_name: 'Lesson', role: 'view', mode: 'live', scope_kind: 'board', revoked_at: null },
};
let seatStatus = 'active';
jest.unstable_mockModule('../server/shareLinks/store.js', () => ({
  getShareLinkById: jest.fn(async (_db, id) => Object.values(links).find((link) => link.id === id) || null),
  linkIsActive: (link) => Boolean(link && !link.revoked_at),
}));
const db = { query: jest.fn(async () => ({ rows: [{ status: seatStatus }] })) };

const { resolveGuestSession } = await import('../server/shareLinks/guestSession.js');
const { handleLiveShowMessage } = await import('../server/ws/liveShowMessages.js');
const hub = await import('../server/collaboration/workspaceHub.js');

const session = {
  guest: {
    linkId: 'seat-link', workspaceId: 'class-ab-seat', guestId: 'guest-sam', name: 'Sam', color: '#4f7cac',
    classId: 'class-1', enrollmentId: 'seat-1', classLinks: { 'lesson-board': 'teach-link' },
  },
};

beforeEach(() => { seatStatus = 'active'; });

test('a class pass opens the student seat for editing and the lesson board to watch', async () => {
  const mine = await resolveGuestSession(db, session, { workspaceId: 'class-ab-seat' });
  expect(mine.link.id).toBe('seat-link');
  expect(mine.capabilities.canEdit).toBe(true);
  expect(mine.actor).toMatchObject({ classStudent: true, spectator: false });
  const teacher = await resolveGuestSession(db, session, { workspaceId: 'lesson-board' });
  expect(teacher.link.id).toBe('teach-link');
  expect(teacher.capabilities.canEdit).toBe(false);
  expect(teacher.actor.spectator).toBe(true);
  expect(teacher.actor.classStudent).toBeUndefined();
});

test('any other board is refused, and so is a lapsed seat', async () => {
  await expect(resolveGuestSession(db, session, { workspaceId: 'someone-else' })).rejects.toMatchObject({ statusCode: 403 });
  await expect(resolveGuestSession(db, session, { workspaceId: '__proto__' })).rejects.toMatchObject({ statusCode: 403 });
  seatStatus = 'lapsed';
  await expect(resolveGuestSession(db, session, { workspaceId: 'class-ab-seat' })).rejects.toMatchObject({ statusCode: 410 });
});

test('a student leads the camera on their seat for members only; other guests still cannot', () => {
  hub.__resetWorkspaceHubForTests();
  const got = { coach: [], peer: [] };
  hub.joinWorkspaceClient({ workspaceId: 'class-ab-seat', clientId: 'coach', actor: { type: 'user', id: '7' }, send: (event) => got.coach.push(event) });
  hub.joinWorkspaceClient({ workspaceId: 'class-ab-seat', clientId: 'peer', actor: { type: 'guest', id: 'g2' }, send: (event) => got.peer.push(event) });
  const sendJson = jest.fn();
  const camera = { type: 'camera', x: 10, y: 20, zoom: 1 };
  handleLiveShowMessage(camera, { ws: {}, workspaceId: 'class-ab-seat', clientId: 'sam', actor: { type: 'guest', id: 'guest-sam', classStudent: true } }, sendJson);
  expect(got.coach).toHaveLength(1);
  expect(got.peer).toHaveLength(0);
  handleLiveShowMessage(camera, { ws: {}, workspaceId: 'class-ab-seat', clientId: 'g2', actor: { type: 'guest', id: 'g2' } }, sendJson);
  expect(sendJson).toHaveBeenCalledWith({}, { type: 'error', reason: 'guests-cannot-lead' });
});
