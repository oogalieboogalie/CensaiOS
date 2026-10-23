// An image's detail from made-up Docker answers: steps newest first with
// their sizes, when it was made and which containers use it.
import { summarizeImage, cleanStep } from './imageHistory.js';

const HISTORY = [
  { ID: 'sha256:aa11bb22cc33dd44', CreatedSince: '2 hours ago', CreatedAt: '2026-10-01T10:00:00Z', CreatedBy: '/bin/sh -c #(nop)  CMD ["node" "server.js"]', Size: '0B' },
  { ID: 'sha256:ee55ff66aa77bb88', CreatedSince: '2 hours ago', CreatedAt: '2026-10-01T09:59:00Z', CreatedBy: '/bin/sh -c npm ci --omit=dev', Size: '412MB' },
  { ID: '<missing>', CreatedSince: '3 weeks ago', CreatedAt: '2026-09-10T08:00:00Z', CreatedBy: '/bin/sh -c #(nop) ADD file:made-up in / ', Size: '7.8MB' },
].map((r) => JSON.stringify(r)).join('\n');
const INSPECT = JSON.stringify([{ Id: 'sha256:3f1a9c2b7d10aaaa', RepoTags: ['madeup/bakery:latest'], Created: '2026-10-01T10:00:00Z', Os: 'linux', Architecture: 'amd64', Size: 419800000 }]);

test('steps come out newest first, cleaned, with their sizes', () => {
  const d = summarizeImage('madeup/bakery:latest', HISTORY, INSPECT, []);
  expect(d.layers.map((l) => l.step)).toEqual(['CMD ["node" "server.js"]', 'RUN npm ci --omit=dev', 'ADD file:made-up in /']);
  expect(d.layers.map((l) => l.size)).toEqual([0, 412_000_000, 7_800_000]);
  expect(d.layers.map((l) => l.id)).toEqual(['aa11bb22cc33', 'ee55ff66aa77', '']);
  expect(d).toMatchObject({ id: '3f1a9c2b7d10', created: '2026-10-01T10:00:00Z', os: 'linux', arch: 'amd64', size: 419800000 });
});

test('containers using the image by tag, by bare name for latest, or by id are listed', () => {
  const containers = [
    { name: 'made-up-shop', image: 'madeup/bakery:latest' },
    { name: 'made-up-old', image: 'madeup/bakery' },
    { name: 'made-up-pinned', image: '3f1a9c2b7d10' },
    { name: 'made-up-other', image: 'redis:7' },
  ];
  expect(summarizeImage('madeup/bakery:latest', HISTORY, INSPECT, containers).inUseBy).toEqual(['made-up-shop', 'made-up-old', 'made-up-pinned']);
});

test('empty answers give an empty detail, and very long steps are cut', () => {
  expect(summarizeImage('madeup/empty:1', '', '', [])).toMatchObject({ layers: [], inUseBy: [], size: 0 });
  expect(cleanStep(`/bin/sh -c ${'x'.repeat(5000)}`)).toHaveLength(2000);
  expect(cleanStep('RUN /bin/sh -c echo made-up # buildkit')).toBe('RUN echo made-up # buildkit');
});
