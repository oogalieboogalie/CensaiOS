import { startServer } from '../server.js';
import { stopTestServer } from './test-setup.js';

describe('startServer', () => {
  const originalPort = process.env.PORT;

  afterEach(() => {
    process.env.PORT = originalPort;
  });

  test('preserves an explicit port 0 request for ephemeral test servers', async () => {
    process.env.PORT = '34567';
    const server = await startServer({
      port: 0,
      startWorkers: false,
      startWatchers: false,
    });

    try {
      const address = server.address();
      expect(address).toBeTruthy();
      expect(typeof address).toBe('object');
      expect(address.port).toEqual(expect.any(Number));
      expect(address.port).not.toBe(34567);
      expect(address.port).not.toBe(3001);
    } finally {
      await stopTestServer(server);
    }
  });
});
