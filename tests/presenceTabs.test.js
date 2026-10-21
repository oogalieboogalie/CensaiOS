// Two browser tabs of one person are a single face in the people list.
import { pendingAppLog } from '../src/lib/appLog/browserLog.js';
import { readAwarenessPresence } from '../src/lib/collaboration/awarenessPresence.js';

test('three awareness states, two from the same person, come back as two faces', () => {
  const states = new Map([
    [11, { user: { id: 'sam-example', name: 'Sam Example', color: 'hsl(20 72% 52%)' }, cursor: { x: 4, y: 8 } }],
    [22, { user: { id: 'sam-example', name: 'Sam Example', color: 'hsl(20 72% 52%)' }, cursor: { x: 40, y: 80 } }],
    [33, { user: { id: 'pat-example', name: 'Pat Example', color: 'hsl(200 72% 52%)' }, cursor: { x: 12, y: 16 } }],
  ]);

  const presence = readAwarenessPresence(states, 11);

  expect(presence.participants).toHaveLength(2);
  expect(presence.participants.map((p) => [p.actor.label, p.self])).toEqual([
    ['Sam Example', true],
    ['Pat Example', false],
  ]);
  expect(pendingAppLog()).toEqual(expect.arrayContaining([
    expect.objectContaining({ level: 'debug', where: 'presence', message: 'presence: merged 1 duplicate tab' }),
  ]));
});

test('the merge line is written once, not on every cursor move', () => {
  const states = new Map([
    [11, { user: { id: 'sam-example', name: 'Sam Example', color: 'hsl(20 72% 52%)' }, cursor: { x: 4, y: 8 } }],
    [22, { user: { id: 'sam-example', name: 'Sam Example', color: 'hsl(20 72% 52%)' }, cursor: { x: 40, y: 80 } }],
  ]);
  const count = () => pendingAppLog().filter((e) => e.where === 'presence').length;
  readAwarenessPresence(new Map(), 11);
  readAwarenessPresence(states, 11);
  const after = count();
  readAwarenessPresence(states, 11);
  readAwarenessPresence(states, 11);
  expect(count()).toBe(after);
});
