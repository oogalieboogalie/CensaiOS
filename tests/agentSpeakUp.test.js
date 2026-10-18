// Speak up (Alex's diagram 17): an agent posts one short note to the Inbox
// on its own, only once someone turned it on for that agent, and at most
// once an hour.
import { jest } from '@jest/globals';
import { NOTE_GAP_MS, postSpeakUpNote, readSpeakUp, setSpeakUp } from '../server/speakUp/store.js';
import { handleSpeakUp } from '../server/tools/handlers/speakUp.js';
import { registerSpeakUpSource, setSpeakUpLister, speakUpReport } from '../server/inbox/speakUpSource.js';
import { listReports, resetInboxSources } from '../server/inbox/sources.js';
import { buildInbox } from '../server/inbox/collect.js';
import { buildScheduledTaskPrompt } from '../server/scheduler/taskPrompt.js';
import { familyDefaultToolNames } from '../server/tools/rbac/familyBaseline.js';

function fakeDb() {
  const switches = new Map();
  const notes = [];
  return {
    notes,
    query: jest.fn(async (sql, params) => {
      if (sql.includes('FROM workspace_agent_speak_up')) {
        return { rows: [...switches].filter(([k]) => k.startsWith(`${params[0]}|`)).map(([k, enabled]) => ({ agent_id: k.split('|')[1], enabled })) };
      }
      if (sql.startsWith('INSERT INTO workspace_agent_speak_up')) switches.set(`${params[0]}|${params[1]}`, params[2]);
      if (sql.startsWith('SELECT created_at')) {
        return { rows: notes.filter(n => n.workspace_id === params[0] && n.agent_id === params[1]).slice(-1) };
      }
      if (sql.startsWith('INSERT INTO agent_speak_up_notes')) {
        notes.push({ workspace_id: params[0], agent_id: params[1], note: params[2], created_at: new Date().toISOString() });
      }
      return { rows: [] };
    }),
  };
}

afterEach(() => resetInboxSources());

test('every agent starts quiet; turning one on lets only that one speak up', async () => {
  const db = fakeDb();
  await expect(readSpeakUp(db, 'b')).resolves.toEqual({ agents: {} });
  expect(await handleSpeakUp('atlas', { note: 'The backup failed.' }, { workspaceId: 'b' }, db)).toMatch(/off for you/);
  await setSpeakUp(db, { workspaceId: 'b', agentId: 'Atlas', enabled: true, userId: 1 });
  expect(await handleSpeakUp('atlas', { note: '  The nightly   backup failed. ' }, { workspaceId: 'b' }, db))
    .toBe('Posted to the Inbox: "The nightly backup failed."');
  expect(await handleSpeakUp('nexus', { note: 'Hi' }, { workspaceId: 'b' }, db)).toMatch(/off for you/);
  expect(db.notes).toHaveLength(1);
});

test('one note an hour, short notes only, and odd agent names are refused', async () => {
  const db = fakeDb();
  await setSpeakUp(db, { workspaceId: 'b', agentId: 'atlas', enabled: true });
  await postSpeakUpNote(db, { workspaceId: 'b', agentId: 'atlas', note: 'x'.repeat(500) });
  expect(db.notes[0].note).toHaveLength(280);
  await expect(postSpeakUpNote(db, { workspaceId: 'b', agentId: 'atlas', note: 'again' })).resolves.toEqual({ posted: false, why: 'too_soon' });
  await expect(postSpeakUpNote(db, { workspaceId: 'b', agentId: 'atlas', note: 'later', now: Date.now() + NOTE_GAP_MS + 1000 }))
    .resolves.toMatchObject({ posted: true });
  await expect(postSpeakUpNote(db, { workspaceId: 'b', agentId: 'atlas', note: '   ' })).resolves.toEqual({ posted: false, why: 'empty' });
  await expect(setSpeakUp(db, { workspaceId: 'b', agentId: '../x', enabled: true })).rejects.toMatchObject({ statusCode: 400 });
});

test('a note shows in the Inbox under Needs you with the agent\'s name, and nothing to fix', async () => {
  setSpeakUpLister(async ({ userId }) => (userId === 7
    ? [{ id: 4, agent_id: 'atlas', note: 'The nightly backup failed.', created_at: '2026-10-17T02:00:00Z', workspace_name: 'Main board' }]
    : []));
  registerSpeakUpSource();
  const { reports } = await listReports({ userId: 7 });
  const [item] = buildInbox({ reports }).items;
  expect(item).toMatchObject({ kind: 'note', state: 'agent_note', group: 'needs', title: 'Atlas spoke up',
    summary: 'The nightly backup failed.', by: 'Atlas', repo: 'Main board', fixable: false, actions: ['acknowledge'] });
  expect((await listReports({ userId: 8 })).reports).toEqual([]);
  expect(speakUpReport({ id: 1, agent_id: 'helper-x', note: 'n', created_at: '2026-10-17T02:00:00Z' }).title).toBe('helper-x spoke up');
});

test('scheduled checks are told about speak_up, and every family agent has the tool', () => {
  expect(buildScheduledTaskPrompt({ task_text: 'Check the backups.' })).toMatch(/speak_up/);
  expect(familyDefaultToolNames('atlas')).toContain('speak_up');
  expect(familyDefaultToolNames('censai')).toContain('speak_up');
});

describe('speak-up notes on the phone', () => {
  const env = { JULES_PHONE_PING_URL: 'https://ntfy.sh/pat-test-topic' };
  const ownerDb = (owns) => ({ query: jest.fn(async () => ({ rows: owns ? [{ '?column?': 1 }] : [] })) });

  test('a note on the owner\'s own board goes to the phone with the agent\'s name', async () => {
    const { pingSpeakUpNote } = await import('../server/speakUp/phone.js');
    const post = jest.fn(async () => ({ ok: true }));
    await expect(pingSpeakUpNote(ownerDb(true), { workspaceId: 'b', agentName: 'Atlas', note: 'The backup failed.' }, { env, post })).resolves.toBe('sent');
    const [url, init] = post.mock.calls[0];
    expect(url).toBe(env.JULES_PHONE_PING_URL);
    expect(init.headers.Title).toBe('Atlas spoke up');
    expect(init.body).toBe('The backup failed.');
  });

  test('off without the address, and a teammate\'s board never reaches the owner\'s phone', async () => {
    const { pingSpeakUpNote } = await import('../server/speakUp/phone.js');
    const post = jest.fn(async () => ({ ok: true }));
    await expect(pingSpeakUpNote(ownerDb(true), { workspaceId: 'b', agentName: 'Atlas', note: 'n' }, { env: {}, post })).resolves.toBe('off');
    await expect(pingSpeakUpNote(ownerDb(false), { workspaceId: 'b', agentName: 'Atlas', note: 'n' }, { env, post })).resolves.toBe('not_owner_board');
    const broken = { query: jest.fn(async () => { throw new Error('db down'); }) };
    await expect(pingSpeakUpNote(broken, { workspaceId: 'b', agentName: 'Atlas', note: 'n' }, { env, post })).resolves.toBe('failed: db down');
    expect(post).not.toHaveBeenCalled();
  });
});
