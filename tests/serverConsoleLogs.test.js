import fs from 'node:fs';
import path from 'node:path';
import { jest } from '@jest/globals';

const SECRET = 'made-up-secret api_key=sk-madeup123 /home/pat/private';

jest.unstable_mockModule('../server/chatModel/completion.js', () => ({
  fetchChatCompletion: async () => { throw Object.assign(new Error(SECRET), { code: 'ETIMEDOUT' }); },
}));

const { onLogRecord } = await import('../server/logger.js');
const { prioritizeArtifacts } = await import('../server/operational-intelligence/prioritization.js');

test('a failed prioritization leaves one fixed ops line with a code and falls back to time order', async () => {
  const records = [];
  const stop = onLogRecord((r) => records.push(r));
  const artifacts = [
    { title: 'Made-up old', created_at: '2026-01-01T00:00:00Z' },
    { title: 'Made-up new', created_at: '2026-02-01T00:00:00Z' },
  ];
  const sorted = await prioritizeArtifacts(artifacts, { query: 'Made-up question from Pat' });
  stop();
  expect(sorted[0].title).toBe('Made-up new');
  const lines = records.filter((r) => JSON.stringify(r).includes('prioritization failed'));
  expect(lines).toHaveLength(1);
  expect(JSON.stringify(lines[0])).toContain('ETIMEDOUT');
  expect(JSON.stringify(records)).not.toContain('sk-madeup123');
  expect(JSON.stringify(records)).not.toContain('Made-up question');
});

test('the last raw server console lines are gone', () => {
  const files = ['boot/authSchema.js', 'boot/attributeSchema.js', 'boot/capabilitySchema.js', 'boot/freshDatabase.js',
    'memory/core/context.js', 'memory/core/capabilities.js', 'qdrant.js', 'vulnerabilityScanner.js',
    'routes/chat/vulnerabilityTripwire.js', 'operational-intelligence/mlops.js', 'operational-intelligence/prioritization.js',
    'routes/operationalIntelligenceEvents.js', 'routes/jules.js', 'sovereignTest.js', 'secrets.js'];
  for (const file of files) {
    const source = fs.readFileSync(path.resolve('server', file), 'utf8');
    expect({ file, console: (source.match(/console\.(log|warn|error|info|debug)\(/g) || []).length }).toEqual({ file, console: 0 });
  }
});
