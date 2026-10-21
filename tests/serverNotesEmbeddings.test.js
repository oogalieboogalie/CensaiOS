import { jest } from '@jest/globals';
import { consoleCalls, stubLogger, watchConsole } from './support/serverNotes.js';

const { lines, logger } = stubLogger();
jest.unstable_mockModule('../server/logger.js', () => logger);
const callModel = jest.fn();
jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  callModel,
  EMBEDDING_MODEL_KIND: 'embedding',
  resolveEmbeddingModelConfig: () => ({ provider: 'openai-compatible', model: 'made-up-embed' }),
}));
const { embed, resetAvailability } = await import('../server/embeddings.js');

test('a failed embedding leaves one embeddings line, without the text or the reply body', async () => {
  resetAvailability();
  const spies = watchConsole();
  callModel.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500, body: 'made-up reply body' }));
  expect(await embed('made-up private note from Pat')).toBeNull();
  expect(lines).toEqual([{ namespace: 'embeddings', level: 'warn', msg: 'embeddings failed, will retry later', meta: { status: 500 } }]);
  expect(JSON.stringify(lines)).not.toMatch(/Pat|made-up reply body/);
  expect(consoleCalls(spies)).toBe(0);
});
