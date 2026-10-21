import { jest } from '@jest/globals';
import request from 'supertest';
import { consoleCalls, stubLogger, watchConsole } from './support/serverNotes.js';

const { lines, logger } = stubLogger();
jest.unstable_mockModule('../server/logger.js', () => logger);
const { createRunnerApp } = await import('../server/runner/service.js');
const SECRET = 'made-up-runner-secret-for-tests-0123456789';

beforeEach(() => { lines.length = 0; });

test('a refused request leaves one runner line, without the address', async () => {
  const spies = watchConsole();
  await request(createRunnerApp({ runnerSecret: SECRET })).post('/exec').send({}).expect(401);
  expect(lines).toEqual([{ namespace: 'runner', level: 'warn', msg: 'runner request refused: wrong or missing runner secret', meta: undefined }]);
  expect(consoleCalls(spies)).toBe(0);
  spies.forEach((spy) => spy.mockRestore());
});

test('a failed command leaves runner lines with the program name only, never its arguments', async () => {
  const spies = watchConsole();
  const res = await request(createRunnerApp({ runnerSecret: SECRET }))
    .post('/exec')
    .set('x-runner-secret', SECRET)
    .send({ command: 'madeup-tool-zz', args: ['--note', 'Pat secret'] });
  expect(res.body.code).not.toBe(0);
  expect(lines.map((l) => [l.namespace, l.msg])).toEqual([
    ['runner', 'runner command started'],
    ['runner', 'runner command failed'],
  ]);
  expect(lines[1].meta.program).toBe('madeup-tool-zz');
  expect(JSON.stringify(lines)).not.toMatch(/Pat secret|--note/);
  expect(consoleCalls(spies)).toBe(0);
  spies.forEach((spy) => spy.mockRestore());
});
