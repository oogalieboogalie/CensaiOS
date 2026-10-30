import { jest } from '@jest/globals';
import request from 'supertest';

// Window import logs what happened, never where the app keeps its files,
// what window:sync printed or the code a person pasted (that goes to their
// screen). The model, the writer and the folder are made up.
const APP = '/made-up-home/pat-example/made-up-app';
const WORDS = 'made-up birthday surprise';
const callModel = jest.fn();
const writeWindowPackage = jest.fn();
const runWindowSync = jest.fn();

jest.unstable_mockModule('../server/aiGateway/callModel.js', () => ({ callModel }));
jest.unstable_mockModule('../server/window-import/windowPackageWriter.js', () => ({
  buildWindowFilePlan: ({ kind, jsx }) => ({ kind, componentName: 'MadeUpPlannerWindow', jsx, windowDir: `${APP}/src/components/windows/${kind}` }),
  normalizeWindowKind: (kind) => kind,
  parseLlmJsonResponse: (text) => JSON.parse(text),
  writeWindowPackage,
  runWindowSync,
}));

const { default: express } = await import('express');
const { windowImportRouter } = await import('../server/routes/windowImport.js');
const { onLogRecord } = await import('../server/logger.js');

const PASTED = `export function MadeUpPlanner() { return <div>${WORDS}</div>; }`;
let records;
let stop;

function app() {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => { req.session = { userId: 1, userRole: 'admin' }; next(); });
  server.use('/api/windows', windowImportRouter);
  return server;
}
const answer = (content) => ({ choices: [{ message: { content } }] });
const lines = () => records.map((record) => `${record.message} ${JSON.stringify(record.meta ?? {})}`);
const naming = () => lines().filter((line) => ['pat-example', 'made-up-app', 'birthday'].some((name) => line.includes(name)));

beforeEach(() => {
  jest.clearAllMocks();
  records = [];
  stop = onLogRecord((record) => { if (record.namespace === 'window-import') records.push(record); });
});
afterEach(() => stop());

test("a written window is logged by its kind, and window:sync's output goes only to the person's screen", async () => {
  callModel.mockResolvedValue(answer(JSON.stringify({ kind: 'madeUpPlanner', label: 'Made-up planner', jsx: PASTED, css: '' })));
  runWindowSync.mockResolvedValue({ ok: false, output: `could not write ${APP}/src/lib/windowRegistry.generated.js` });
  const res = await request(app()).post('/api/windows/import').send({ rawJsx: PASTED });
  expect(res.status).toBe(200);
  expect(writeWindowPackage).toHaveBeenCalledTimes(1);
  expect(res.body).toMatchObject({ syncOk: false, syncOutput: expect.stringContaining(APP) });
  expect(records.map((record) => [record.message, record.meta])).toEqual([
    ['adapting window code via LLM', undefined],
    ['window files written', { kind: 'madeUpPlanner', componentName: 'MadeUpPlannerWindow' }],
    ['window:sync result', { ok: false }],
  ]);
  expect(naming()).toEqual([]);
});

test("an answer that is not JSON is logged by its length, never its words", async () => {
  callModel.mockResolvedValue(answer(`Here is your window: ${PASTED}`));
  const res = await request(app()).post('/api/windows/import').send({ rawJsx: PASTED });
  expect(res.status).toBe(502);
  expect(records.find((record) => record.message === 'LLM returned non-JSON')?.meta).toEqual({ chars: `Here is your window: ${PASTED}`.length });
  expect(naming()).toEqual([]);
});
