import http from 'node:http';
import { createA2AGuardedFetch } from '../server/agent-registry/adapters/egress.js';
import { RUNTIME_MODES } from '../server/middleware/runtimeMode.js';

describe('A2A DNS-pinned fetch', () => {
  let server;
  let port;
  let requests;

  beforeEach(async () => {
    requests = [];
    server = http.createServer((req, res) => {
      requests.push({ host: req.headers.host, url: req.url });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    port = server.address().port;
  });

  afterEach(() => new Promise(resolve => server.close(resolve)));

  test('connects to the validated address while preserving the original host', async () => {
    const guarded = createA2AGuardedFetch({
      mode: RUNTIME_MODES.LOCAL_DESKTOP,
      lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    });
    const response = await guarded(`http://agent.invalid:${port}/card`);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(requests).toEqual([{ host: `agent.invalid:${port}`, url: '/card' }]);
  });

  test('denies a private resolved address in cloud mode before connecting', async () => {
    const guarded = createA2AGuardedFetch({
      mode: RUNTIME_MODES.CLOUD_SAAS,
      lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    });
    await expect(guarded(`https://agent.invalid:${port}/card`))
      .rejects.toMatchObject({ code: 'A2A_EGRESS_DENIED' });
    expect(requests).toHaveLength(0);
  });
});
