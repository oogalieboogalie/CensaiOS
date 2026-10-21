import { jest } from '@jest/globals';
import { consoleCalls, stubLogger, watchConsole } from './support/serverNotes.js';

const { lines, logger } = stubLogger();
jest.unstable_mockModule('../server/logger.js', () => logger);
const query = jest.fn();
jest.unstable_mockModule('../server/db.js', () => ({ default: { query, on: jest.fn(), end: jest.fn() }, createDbPool: () => ({ query }) }));
const embed = jest.fn();
jest.unstable_mockModule('../server/embeddings.js', () => ({ embed, embeddingsAvailable: () => true }));
jest.unstable_mockModule('../server/qdrant.js', () => ({ upsertVector: jest.fn(), searchVectors: jest.fn() }));
jest.unstable_mockModule('../server/memory/persistence.js', () => ({ storeHolographic: jest.fn() }));
jest.unstable_mockModule('../server/memory/relations.js', () => ({ autoAssociate: jest.fn() }));
const { storeMemory } = await import('../server/memory/core/memory.js');

test('a failed vectorization leaves one memory line, without the memory text', async () => {
  const spies = watchConsole();
  query.mockResolvedValueOnce({ rows: [{ id: 41 }] });
  embed.mockRejectedValueOnce(Object.assign(new Error('made-up failure about Pat'), { code: 'ECONNRESET' }));
  const id = await storeMemory('made-up-agent', 'Pat likes the made-up blue mug', 'observation', {
    userId: 7, workspaceId: 'w1', importance: 0.1, emotionalWeight: 0, autoAssociate: false,
  });
  expect(id).toBe(41);
  expect(lines).toEqual([{ namespace: 'memory', level: 'warn', msg: 'memory vectorization skipped', meta: { code: 'ECONNRESET' } }]);
  expect(JSON.stringify(lines)).not.toMatch(/Pat|mug/);
  expect(consoleCalls(spies)).toBe(0);
});
