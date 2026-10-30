import { jest } from '@jest/globals';

// The Reliability window's "Run a scan" logs counts and time only: never the
// project's name or its folder. The project, its files and the database are
// made up.
const PROJECT = { name: 'made-up-project', path: '/made-up-home/pat-example/made-up-project' };
const NAMED = ['made-up-project', 'pat-example', 'made-up-plans', 'made-up-budget'];
const results = [
  { filePath: 'made-up-plans/made-up-budget.js', score: 90, heuristics: {} },
  { filePath: 'made-up-plans/made-up-party.js', score: 40, heuristics: {} },
];

jest.unstable_mockModule('../server/db.js', () => ({ default: { query: async () => ({ rows: [{ id: 1 }] }) } }));
jest.unstable_mockModule('../server/lib/reliability/engine.js', () => ({ loadConfig: async () => ({ thresholds: { overall: 80 } }) }));
jest.unstable_mockModule('../server/lib/reliability/projectScan.js', () => ({ scanProjectFolder: () => ({ results, capped: false }) }));
jest.unstable_mockModule('../server/routes/projects/shared.js', () => ({ resolveRequestedProject: async () => PROJECT }));
jest.unstable_mockModule('../server/workspaces/shared.js', () => ({ resolveProjectPathForRuntime: (p) => p }));

const { projectScanHandler } = await import('../server/routes/reliabilityProject.js');
const { onLogRecord } = await import('../server/logger.js');

test('a scan logs that it started and how it went, never the project it scanned', async () => {
  const records = [];
  const stop = onLogRecord((record) => { if (record.namespace === 'reliability') records.push(record); });
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  const handler = projectScanHandler(async () => ({ workspaceId: 7 }), () => { throw new Error('no scope'); });
  try {
    await handler({ body: { projectPath: PROJECT.path } }, res);
  } finally {
    stop();
  }
  expect(res.code).toBe(201);
  expect(res.body).toMatchObject({ project: PROJECT.name, scanned: 2, findings: 1 });
  expect(records.map((record) => record.message)).toEqual([
    'scan: started',
    expect.stringMatching(/^scan: finished, 2 files, 1 need review, \d+ ms$/),
  ]);
  const lines = records.map((record) => `${record.message} ${JSON.stringify(record.meta ?? {})}`);
  expect(lines.filter((line) => NAMED.some((name) => line.includes(name)))).toEqual([]);
});
