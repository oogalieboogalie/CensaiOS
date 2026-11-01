import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

// One rule for every address the server calls for someone (outside tool
// servers and hosted agents): public internet only on a hosted or shared
// censaiOS, and the connection goes to the address that was checked, so a
// name that changes its answer after the check (DNS rebinding) gets nowhere.

const { isPrivateAddress, vetHost, pinnedLookup, pinnedFetch, netFetch, privateAddressesAllowed } = await import('../server/security/publicAddress.js');
const { assertReachableUrl, reachableFetch } = await import('../server/outsideTools/netGuard.js');
const { onLogRecord } = await import('../server/logger.js');

const logged = [];
onLogRecord((record) => { if (record.namespace === 'outside-tools') logged.push(record); });

const MODE_KEYS = ['CENSAI_MODE', 'HOMEBASE_MODE', 'HOMEBASE_ALLOW_LOCAL_FILES'];
const saved = Object.fromEntries(MODE_KEYS.map((k) => [k, process.env[k]]));
const runAs = (mode, extra = {}) => { for (const k of MODE_KEYS) delete process.env[k]; Object.assign(process.env, { CENSAI_MODE: mode, ...extra }); };
afterEach(() => { for (const k of MODE_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

test('reserved ranges count as private', () => {
  for (const ip of ['192.0.0.8', '192.0.2.1', '198.18.0.1', '198.19.255.1', '198.51.100.7', '203.0.113.10', '::ffff:c000:201']) {
    expect(isPrivateAddress(ip)).toBe(true);
  }
  for (const ip of ['192.0.1.1', '198.17.0.1', '198.20.0.1', '198.51.101.1', '203.0.114.1', '34.120.1.2']) {
    expect(isPrivateAddress(ip)).toBe(false);
  }
});

test('a name that changes its answer after the check stays pinned to the checked address', async () => {
  let lookups = 0;
  const rebinding = async () => (lookups++ === 0 ? [{ address: '34.120.1.2' }] : [{ address: '169.254.169.254' }]);
  const { addresses, blocked } = await vetHost('rebind.example', { resolve: rebinding });
  expect(blocked).toBeNull();
  // Every lookup the connection itself makes gets the checked address, never a fresh answer.
  const lookup = pinnedLookup(addresses);
  for (let i = 0; i < 3; i += 1) {
    lookup('rebind.example', { all: true }, (err, list) => expect(list).toEqual([{ address: '34.120.1.2', family: 4 }]));
    lookup('rebind.example', {}, (err, address) => expect(address).toBe('34.120.1.2'));
  }
  expect(lookups).toBe(1);
  // A second check sees the new private answer and refuses.
  expect((await vetHost('rebind.example', { resolve: rebinding })).blocked).toBe('169.254.169.254');
});

describe('pinned connections really go to the pinned address', () => {
  let server;
  let wss;
  let port;
  beforeAll(async () => {
    server = http.createServer((req, res) => (req.url === '/hop' ? res.writeHead(302, { location: 'http://127.0.0.1/' }).end() : res.end(`host=${req.headers.host}`)));
    wss = new WebSocketServer({ server });
    wss.on('connection', (socket) => socket.on('message', (m) => socket.send(`echo ${m}`)));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
  });
  afterAll(async () => { wss.close(); await new Promise((resolve) => server.close(resolve)); });

  // pinned.invalid never resolves in real DNS: reaching the server proves only the pinned address is used.
  test('fetch keeps the name in the Host header and does not follow redirects', async () => {
    const pinned = pinnedFetch(['127.0.0.1']);
    const res = await pinned(`http://pinned.invalid:${port}/`);
    expect(await res.text()).toBe(`host=pinned.invalid:${port}`);
    expect((await pinned(`http://pinned.invalid:${port}/hop`)).status).toBe(302);
  });

  test('the hosted-agent fetch pins when told the checked addresses', async () => {
    const res = await netFetch(`http://pinned.invalid:${port}/`, { pinnedAddresses: ['127.0.0.1'] });
    expect(await res.text()).toBe(`host=pinned.invalid:${port}`);
  });

  test('the ElevenLabs chat socket uses the pinned address too', async () => {
    const socket = new WebSocket(`ws://pinned.invalid:${port}/`, { lookup: pinnedLookup(['127.0.0.1']) });
    const reply = await new Promise((resolve, reject) => {
      socket.on('open', () => socket.send('hi'));
      socket.on('message', (m) => resolve(String(m)));
      socket.on('error', reject);
    });
    socket.close();
    expect(reply).toBe('echo hi');
  });
});

describe('outside tool servers follow the same rule', () => {
  test('pinned where private addresses are refused, plain fetch on the desktop app', async () => {
    const { fetchImpl } = await reachableFetch('https://tools.example/mcp', { cloud: true, resolve: async () => [{ address: '34.120.1.2' }] });
    expect(fetchImpl).not.toBe(globalThis.fetch);
    expect((await reachableFetch('http://localhost:8765/mcp', { cloud: false })).fetchImpl).toBe(globalThis.fetch);
  });

  test('a private server refuses this network unless it turned on local files, like hosted agents', async () => {
    runAs('private_server');
    expect(privateAddressesAllowed()).toBe(false);
    await expect(assertReachableUrl('http://127.0.0.1:8765/mcp')).rejects.toThrow(/public internet/);
    runAs('private_server', { HOMEBASE_ALLOW_LOCAL_FILES: 'true' });
    await expect(assertReachableUrl('http://127.0.0.1:8765/mcp')).resolves.toBeInstanceOf(URL);
    runAs('cloud_saas', { HOMEBASE_ALLOW_LOCAL_FILES: 'true' });
    await expect(assertReachableUrl('http://127.0.0.1:8765/mcp')).rejects.toThrow(/public internet/);
    runAs('local_desktop');
    await expect(assertReachableUrl('http://127.0.0.1:8765/mcp')).resolves.toBeInstanceOf(URL);
  });
});

test('every outside-tools refusal is logged with the host and the refused address', async () => {
  logged.length = 0;
  await expect(assertReachableUrl('https://sneaky.example/mcp', { cloud: true, resolve: async () => [{ address: '34.120.1.2' }, { address: '10.0.0.5' }] })).rejects.toThrow();
  await expect(assertReachableUrl('https://nowhere.invalid/mcp', { cloud: true, resolve: async () => [] })).rejects.toThrow();
  await expect(assertReachableUrl('https://me:secret-key@tools.example/mcp', { cloud: true })).rejects.toThrow();
  expect(logged.map((r) => [r.level, r.message, r.meta])).toEqual([
    ['warn', 'address refused: private network', { host: 'sneaky.example', address: '10.0.0.5' }],
    ['warn', 'address refused: not found on the internet', { host: 'nowhere.invalid' }],
    ['warn', 'address refused: not a usable web address', { reason: 'not-a-web-address' }],
  ]);
  expect(JSON.stringify(logged)).not.toContain('secret-key');
});
