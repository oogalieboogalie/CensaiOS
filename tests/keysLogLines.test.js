import { jest } from '@jest/globals';
import request from 'supertest';

const lines = [];
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: (namespace) => {
    const write = (level) => (msg, meta) => lines.push({ namespace, level, msg, meta });
    return { info: write('info'), warn: write('warn'), error: write('error'), debug: () => {} };
  },
}));
const mockPool = { query: jest.fn() };
jest.unstable_mockModule('../server/db.js', () => ({ default: mockPool }));
const setKeySharing = jest.fn();
jest.unstable_mockModule('../server/security/keySharing.js', () => ({
  isKeySharedWith: () => false,
  readKeySharing: () => ({ userIds: [] }),
  setKeySharing,
}));
jest.unstable_mockModule('../server/middleware/runtimeMode.js', () => ({
  getRuntimeMode: () => 'local_desktop',
  RUNTIME_MODES: { LOCAL_DESKTOP: 'local_desktop' },
}));

const { default: express } = await import('express');
const { keysRouter } = await import('../server/routes/keys.js');
const { keySharingRouter } = await import('../server/routes/keySharing.js');

function app(session) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.session = session; next(); });
  a.use('/api', keysRouter);
  a.use('/api/key-sharing', keySharingRouter);
  return a;
}

beforeEach(() => {
  lines.length = 0;
  jest.clearAllMocks();
  mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 });
});

const text = () => JSON.stringify(lines);

describe('AI key actions in the app log', () => {
  test('saving a key leaves one line without the key', async () => {
    const res = await request(app({ userId: 42 })).post('/api/keys').send({ provider: 'openrouter', apiKey: 'sk-or-secret-123', modelName: 'pat-model' });
    expect(res.status).toBe(201);
    expect(lines).toEqual([{ namespace: 'keys', level: 'info', msg: 'key saved', meta: { userId: 42, provider: 'openrouter', withModel: true } }]);
    expect(text()).not.toMatch(/sk-or-secret|pat-model/);
  });

  test('a failed save logs a code and tells the window in plain words', async () => {
    mockPool.query.mockRejectedValue(Object.assign(new Error('value sk-or-secret-123 too long for sam@example.com'), { code: '22001' }));
    const res = await request(app({ userId: 42 })).post('/api/keys').send({ provider: 'openrouter', apiKey: 'sk-or-secret-123' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Could not save the key.');
    expect(lines[0]).toMatchObject({ level: 'error', msg: 'key save failed', meta: { userId: 42, provider: 'openrouter', code: '22001' } });
    expect(text()).not.toMatch(/sk-or-secret|sam@example/);
  });

  test('removing a key says whether there was one', async () => {
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await request(app({ userId: 7 })).delete('/api/keys/openrouter').expect(200);
    expect(lines).toEqual([{ namespace: 'keys', level: 'info', msg: 'key removed', meta: { userId: 7, provider: 'openrouter', found: false } }]);
  });

  test('sharing keys logs the change, and a non-owner is refused with a line', async () => {
    mockPool.query.mockResolvedValue({ rows: [{ id: 5, name: 'Mo', email: 'mo@example.com', role: 'user' }] });
    await request(app({ userId: 1, userRole: 'admin' })).put('/api/key-sharing/5').send({ shared: true }).expect(200);
    expect(setKeySharing).toHaveBeenCalledWith('5', true);
    expect(lines).toContainEqual({ namespace: 'keys', level: 'info', msg: 'key sharing changed', meta: { userId: 1, account: '5', shared: true } });

    await request(app({ userId: 5, userRole: 'user' })).put('/api/key-sharing/5').send({ shared: true }).expect(403);
    expect(lines).toContainEqual({ namespace: 'keys', level: 'warn', msg: 'key sharing refused: not the owner', meta: { userId: 5 } });
    expect(text()).not.toMatch(/Mo|mo@example/);
  });
});
