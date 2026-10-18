// Agents keep the real conversation, with times: every message and when it
// was sent, the current time, the gap since the last message, and the
// actual earlier exchange (not a summary) in what the model reads.
import { agoWords, gapWords, safeTimeZone, stamp } from '../src/lib/agentMemory/timeWords.js';
import {
  chatClock, exchangesSection, leftOffSection, nowSection, pickChats, stampMessages,
} from '../server/agentMemory/recallTurns.js';
import { buildMemoryBlock } from '../server/agentMemory/recall.js';
import { conversationFor } from '../server/agentMemory/forRun.js';
import { chatIdOf, msgsFromTurns, windowForChat, windowsByTouch } from '../src/lib/recents.js';

const TZ = 'America/Chicago';

test('times carry the date, the time to the second and the zone', () => {
  expect(stamp('2026-10-17T23:04:12Z', TZ)).toBe('Sat 2026-10-17 18:04:12 CDT');
  expect(stamp('2026-10-17T23:04:12Z', 'UTC')).toBe('Sat 2026-10-17 23:04:12 UTC');
  expect(stamp('not a date', TZ)).toBe('');
  expect(safeTimeZone('Not/AZone')).toBeUndefined();
  expect(safeTimeZone(TZ)).toBe(TZ);
});

test('gaps read like a person would say them', () => {
  const t = (s) => new Date(Date.parse('2026-10-17T12:00:00Z') + s * 1000).toISOString();
  expect(gapWords(t(0), t(12))).toBe('12 seconds');
  expect(gapWords(t(0), t(66))).toBe('about a minute');
  expect(gapWords(t(0), t(600))).toBe('10 minutes');
  expect(gapWords(t(0), t(3 * 3600))).toBe('3 hours');
  expect(gapWords(t(0), t(3 * 86400))).toBe('3 days');
  expect(agoWords(t(0), t(30))).toBe('just now');
  expect(agoWords(t(0), t(1200))).toBe('20 minutes ago');
});

const chat = [
  { from: 'me', text: 'Maple Street goes live Friday.', at: '2026-10-17T23:00:00Z' },
  { from: 'atlas', text: 'Noted.', at: '2026-10-17T23:00:02Z' },
  { from: 'me', text: 'How long has it been?', at: '2026-10-17T23:01:05Z' },
];

test('the agent is told the time now and how long ago the person last wrote', () => {
  const clock = chatClock(chat, { agentId: 'atlas' });
  const text = nowSection({ now: new Date('2026-10-17T23:01:06Z'), timeZone: TZ, clock });
  expect(text).toContain('It is Sat 2026-10-17 18:01:06 CDT.');
  expect(text).toContain('Their message before that was at Sat 2026-10-17 18:00:00 CDT, about a minute earlier.');
  expect(text).toContain('they wrote back about a minute later');
});

test('each message from the person reaches the model with the time it was sent', () => {
  const chatMessages = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: [{ type: 'text', text: 'c' }] }];
  const out = stampMessages(chatMessages, chat, TZ);
  expect(out[1].content).toBe('[Sat 2026-10-17 18:00:00 CDT] a');
  expect(out[2].content).toBe('b');
  expect(out[3].content[0]).toEqual({ type: 'text', text: '[Sat 2026-10-17 18:01:05 CDT]' });
  // A list that does not line up is left alone rather than stamped wrong.
  expect(stampMessages(chatMessages.slice(0, 2), chat, TZ)).toEqual(chatMessages.slice(0, 2));
});

const turn = (id, speaker, text, at, conversation_id = 'chat:w1') => ({ id, speaker, text, at, conversation_id });

test('earlier chats come back as the real messages with times and how they ended', () => {
  const text = exchangesSection([{
    conversationId: 'chat:w1',
    turns: [turn(1, 'person', 'Maple Street goes live Friday.', '2026-10-16T15:00:00Z'), turn(2, 'agent', 'Noted.', '2026-10-16T15:00:02Z')],
    ending: turn(9, 'person', 'We pulled Maple Street. Oak Avenue instead.', '2026-10-16T17:00:00Z'),
  }], TZ);
  expect(text).toContain('not a summary');
  expect(text).toContain('[Fri 2026-10-16 10:00:00 CDT] Person: Maple Street goes live Friday.');
  expect(text).toContain('[Fri 2026-10-16 10:00:02 CDT] You: Noted.');
  expect(text).toContain('how that chat ended (2 hours later)');
  expect(text).toContain('Oak Avenue instead.');
});

test('where you left off quotes the end of the last chat', () => {
  const text = leftOffSection(
    { started_at: '2026-10-16T15:00:00Z', last_at: '2026-10-16T17:00:00Z', workspace_name: 'Listings' },
    [turn(9, 'person', 'Oak Avenue instead.', '2026-10-16T17:00:00Z')], TZ,
  );
  expect(text).toContain('on the board "Listings"');
  expect(text).toContain('[Fri 2026-10-16 12:00:00 CDT] Person: Oak Avenue instead.');
  expect(leftOffSection(null, [], TZ)).toBe('');
});

test('one entry per chat, best match first', () => {
  const picked = pickChats([turn(1, 'person', 'a', 'x', 'c1'), turn(2, 'agent', 'b', 'x', 'c1'), turn(3, 'person', 'c', 'x', 'c2')]);
  expect(picked.map((t) => t.conversation_id)).toEqual(['c1', 'c2']);
});

test('the memory block leads with time and drops old summaries when real messages exist', () => {
  const block = buildMemoryBlock({ timeSections: ['## Right now\nIt is now.', ''], episodes: [] });
  expect(block).toContain('# Your memory');
  expect(block.indexOf('## Right now')).toBeGreaterThan(0);
  expect(buildMemoryBlock({})).toBe('');
});

test('a chat window keeps one conversation id until New chat', () => {
  expect(conversationFor({ windowId: 'w1', origin: 'chat' })).toBe('chat:w1');
  expect(conversationFor({ conversationId: 'chat:w1:2', windowId: 'w1', origin: 'chat' })).toBe('chat:w1:2');
  expect(conversationFor({ origin: 'help' })).toMatch(/^help:/);
  expect(chatIdOf({ id: 'w1' })).toBe('chat:w1');
  expect(chatIdOf({ id: 'w1', chatId: 'chat:w1:2' })).toBe('chat:w1:2');
});

test('Recents finds the open window for a chat, or rebuilds its messages', () => {
  const wins = [{ id: 'w1', updatedAt: '2026-10-17T10:00:00Z' }, { id: 'w2', chatId: 'chat:w2:9', updatedAt: '2026-10-17T11:00:00Z' }];
  expect(windowForChat({ id: 'chat:w1', windowId: 'w1' }, wins)?.id).toBe('w1');
  // The window was cleared with New chat: it no longer shows that chat.
  expect(windowForChat({ id: 'chat:w2', windowId: 'w2' }, wins)).toBeNull();
  expect(windowsByTouch(wins).map((r) => r.win.id)).toEqual(['w2', 'w1']);
  expect(msgsFromTurns([{ speaker: 'person', text: 'hi', at: 'x' }, { speaker: 'agent', text: 'yo', at: 'y' }], 'atlas'))
    .toEqual([{ from: 'me', text: 'hi', at: 'x' }, { from: 'atlas', text: 'yo', at: 'y' }]);
});
