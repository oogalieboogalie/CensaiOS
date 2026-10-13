// Outside tools (MCP inward): the pieces that talk to outside MCP servers.
// Pins: both transports (web address and a program on this computer) list
// and call tools, keys reach the server and are turned down clearly when
// wrong, tool names stay legal for every model, the hosted version cannot
// reach private addresses, and a program's command is never run through a
// shell on Linux or macOS.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHttpClient, replyFromEventStream } from '../server/outsideTools/httpClient.js';
import { createStdioClient, stdioEnv } from '../server/outsideTools/stdioClient.js';
import { callServerTool, closeAll, listServerTools, resultText } from '../server/outsideTools/connections.js';
import {
  isOutsideToolName, publicToolName, serverSlug, splitOutsideToolName, toolDefinitions,
} from '../server/outsideTools/toolNames.js';
import { assertReachableUrl, isPrivateAddress, parseServerUrl } from '../server/outsideTools/netGuard.js';
import { splitCommandLine } from '../server/outsideTools/commandLine.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const STDIO_SERVER = path.join(here, 'fixtures/outside-tools/stdio-server.mjs');

/** A Streamable HTTP MCP server: session ids, SSE replies for tool calls. */
function startHttpServer({ key = 'secret-1' } = {}) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push({ method: req.method, auth: req.headers.authorization, session: req.headers['mcp-session-id'], body });
      if (req.headers.authorization !== `Bearer ${key}`) { res.statusCode = 401; return res.end('{}'); }
      if (req.method === 'DELETE') return res.end();
      const msg = JSON.parse(body);
      if (!('id' in msg)) { res.statusCode = 202; return res.end(); }
      if (msg.method === 'initialize') {
        res.setHeader('mcp-session-id', 'sess-1');
        res.setHeader('content-type', 'application/json');
        return res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-06-18', capabilities: {} } }));
      }
      if (req.headers['mcp-session-id'] !== 'sess-1') { res.statusCode = 400; return res.end('{}'); }
      if (msg.method === 'tools/list') {
        res.setHeader('content-type', 'application/json');
        return res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tools: [
          { name: 'get_forecast', description: 'Forecast', inputSchema: { $schema: 'x', type: 'object', properties: { city: { type: 'string' } } } },
        ] } }));
      }
      res.setHeader('content-type', 'text/event-stream');
      const isError = msg.params.arguments.city === 'Nowhere';
      res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress', params: {} })}\n\n`);
      res.end(`data: ${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { isError, content: [{ type: 'text', text: isError ? 'unknown city' : `Sunny in ${msg.params.arguments.city}` }] } })}\n\n`);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, url: `http://127.0.0.1:${server.address().port}/mcp` })));
}

afterAll(() => closeAll());

describe('web address servers (Streamable HTTP)', () => {
  test('lists and calls tools, sending the key and the session id back', async () => {
    const { server, seen, url } = await startHttpServer();
    const row = { id: 'srv-http', transport: 'http', url, updated_at: 1 };
    try {
      const tools = await listServerTools(row, 'secret-1');
      expect(tools.map((t) => t.name)).toEqual(['get_forecast']);
      expect(await callServerTool(row, 'secret-1', 'get_forecast', { city: 'Austin' })).toBe('Sunny in Austin');
      await expect(callServerTool(row, 'secret-1', 'get_forecast', { city: 'Nowhere' })).rejects.toThrow(/unknown city/);
      expect(seen.every((s) => s.auth === 'Bearer secret-1')).toBe(true);
      expect(seen.filter((s) => s.body.includes('tools/')).every((s) => s.session === 'sess-1')).toBe(true);
    } finally { closeAll(); server.close(); }
  });

  test('a wrong key is reported in plain words', async () => {
    const { server, url } = await startHttpServer();
    try {
      await expect(createHttpClient({ url, secret: 'nope' }).connect()).rejects.toThrow(/turned the key down/);
    } finally { server.close(); }
  });

  test('an unreachable server says so', async () => {
    await expect(createHttpClient({ url: 'http://127.0.0.1:9/mcp', timeoutMs: 2000 }).connect()).rejects.toThrow(/did not answer/);
  });

  test('picks the matching reply out of an event stream', () => {
    const body = 'data: {"jsonrpc":"2.0","id":1,"result":{"a":1}}\n\ndata: {"jsonrpc":"2.0","id":2,"result":{"b":2}}\n\n';
    expect(replyFromEventStream(body, 2)).toEqual({ jsonrpc: '2.0', id: 2, result: { b: 2 } });
    expect(replyFromEventStream(body, 3)).toBeNull();
  });
});

describe('programs on this computer (stdio)', () => {
  test('starts the program with the key in the named setting, lists and calls tools, answers its ping', async () => {
    const row = { id: 'srv-stdio', transport: 'stdio', command: process.execPath, args: [STDIO_SERVER], secret_env: 'ECHO_KEY', updated_at: 1 };
    const tools = await listServerTools(row, 'k-123');
    expect(tools).toEqual([expect.objectContaining({ name: 'echo' })]);
    expect(await callServerTool(row, 'k-123', 'echo', { text: 'hi' })).toBe('echo: hi');
    closeAll();
  });

  test('a program that stops early reports its error line', async () => {
    const client = createStdioClient({ command: process.execPath, args: [STDIO_SERVER], timeoutMs: 5000 });
    await expect(client.connect()).rejects.toThrow(/stopped \(code 3\): Error: missing ECHO_KEY/);
    client.close();
  });

  test('the program never sees the server secrets', () => {
    const env = stdioEnv({
      secret: 'k', secretEnv: 'MY_KEY',
      source: { PATH: '/bin', DATABASE_URL: 'postgres://x', SESSION_SECRET: 's', JOURNAL_SECRET: 'j' },
    });
    expect(env).toMatchObject({ PATH: '/bin', MY_KEY: 'k' });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.SESSION_SECRET).toBeUndefined();
    expect(env.JOURNAL_SECRET).toBeUndefined();
    expect(stdioEnv({ secret: 'k', secretEnv: 'bad name' }).bad).toBeUndefined();
  });

  test('splits a typed command into a program and its arguments', () => {
    expect(splitCommandLine('npx -y @scope/server --dir "My Files" \'a b\' ""'))
      .toEqual(['npx', '-y', '@scope/server', '--dir', 'My Files', 'a b', '']);
    expect(splitCommandLine('  ')).toEqual([]);
    expect(splitCommandLine('echo hi; rm -rf /')).toEqual(['echo', 'hi;', 'rm', '-rf', '/']);
  });
});

describe('tool names and results', () => {
  test('names are legal for every model and map back to the server and tool', () => {
    expect(serverSlug('My Weather Server!!')).toBe('my_weather_serve');
    const long = publicToolName('weather', 'x'.repeat(200));
    expect(long.length).toBeLessThanOrEqual(64);
    expect(publicToolName('weather', 'get.forecast/v2')).toBe('mcp__weather__get_forecast_v2');
    expect(isOutsideToolName('mcp__weather__get')).toBe(true);
    expect(isOutsideToolName('web_search')).toBe(false);
    expect(splitOutsideToolName('mcp__weather__get_forecast')).toEqual({ server: 'weather', tool: 'get_forecast' });
  });

  test('definitions say where the tool comes from and drop $schema', () => {
    const [tool] = toolDefinitions({ name: 'Weather', slug: 'weather', tools: [
      { name: 'get_forecast', description: 'Forecast', inputSchema: { $schema: 'x', type: 'object', properties: { city: {} } } },
    ] });
    expect(tool.realName).toBe('get_forecast');
    expect(tool.definition.function).toEqual({
      name: 'mcp__weather__get_forecast',
      description: '[Outside tool from Weather] Forecast',
      parameters: { type: 'object', properties: { city: {} } },
    });
  });

  test('results become text, long ones are cut', () => {
    expect(resultText({ content: [{ type: 'text', text: 'a' }, { type: 'image' }] })).toBe('a\n[image returned, not shown]');
    expect(resultText({ structuredContent: { x: 1 } })).toBe('{"x":1}');
    expect(resultText({}).length).toBeGreaterThan(0);
    expect(resultText({ content: [{ type: 'text', text: 'y'.repeat(30000) }] }).length).toBeLessThan(20010);
  });
});

describe('which addresses are allowed', () => {
  test('only http and https, no key inside the address', () => {
    expect(() => parseServerUrl('ftp://x')).toThrow(/https/);
    expect(() => parseServerUrl('nonsense')).toThrow(/not a web address/);
    expect(() => parseServerUrl('https://me:pw@x.com/mcp')).toThrow(/Key box/);
  });

  test('private addresses are refused on the hosted version, allowed on the desktop app', async () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.4', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    await expect(assertReachableUrl('http://127.0.0.1:8765/mcp', { cloud: true })).rejects.toThrow(/public internet/);
    await expect(assertReachableUrl('https://evil.test/mcp', { cloud: true, resolve: async () => [{ address: '10.0.0.5' }] }))
      .rejects.toThrow(/public internet/);
    await expect(assertReachableUrl('https://ok.test/mcp', { cloud: true, resolve: async () => [{ address: '93.184.216.34' }] }))
      .resolves.toBeInstanceOf(URL);
    await expect(assertReachableUrl('http://localhost:8765/mcp', { cloud: false })).resolves.toBeInstanceOf(URL);
  });
});
