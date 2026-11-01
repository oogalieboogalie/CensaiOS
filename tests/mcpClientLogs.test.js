import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { onLogRecord } from '../server/logger.js';
import { initializeMcpTools, shutdownMcpTools } from '../server/tools/mcpClient.js';
import { TOOL_DEFINITIONS } from '../server/tools/definitions.js';
import { TOOL_REGISTRY } from '../server/tools/handlers/index.js';
import { executeTool } from '../server/tools.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(here, '../config/mcp_servers.json');
const serverPath = path.join(here, 'mockMcpLeakyServer.js');
const KEY = 'made-up-key-123';
const STDERR_TOKEN = 'made-up-stderr-token-456';
const USER_TEXT = 'Pat made-up private note';

// A made-up MCP server that prints a token to its error output and one
// line that is not JSON, then answers the usual handshake and one tool.
const SERVER = `
  import readline from 'readline';
  process.stderr.write('starting with token=${STDERR_TOKEN}\\n');
  console.log('not json ${STDERR_TOKEN}');
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const send = (id, result) => console.log(JSON.stringify({ jsonrpc: '2.0', id, result }));
  rl.on('line', (line) => {
    const m = JSON.parse(line);
    if (m.method === 'initialize') send(m.id, { protocolVersion: '2024-11-05', serverInfo: { name: 'Made-up', version: '1' } });
    else if (m.method === 'tools/list') send(m.id, { tools: [{ name: 'echo', inputSchema: { type: 'object', properties: { msg: { type: 'string' } } } }] });
    else if (m.method === 'tools/call') send(m.id, { content: [{ type: 'text', text: 'ok' }], isError: false });
  });
`;

describe('MCP client log lines', () => {
  let savedConfig = null;
  const defsBefore = TOOL_DEFINITIONS.length;
  const registryBefore = new Set(Object.keys(TOOL_REGISTRY));

  beforeAll(() => {
    if (fs.existsSync(configPath)) savedConfig = fs.readFileSync(configPath, 'utf8');
    fs.writeFileSync(serverPath, SERVER, 'utf8');
  });

  afterAll(() => {
    shutdownMcpTools();
    fs.rmSync(serverPath, { force: true });
    if (savedConfig != null) fs.writeFileSync(configPath, savedConfig, 'utf8');
    else fs.rmSync(configPath, { force: true });
    TOOL_DEFINITIONS.length = defsBefore;
    for (const key of Object.keys(TOOL_REGISTRY)) if (!registryBefore.has(key)) delete TOOL_REGISTRY[key];
  });

  test('never logs launch arguments, error output, raw lines or tool arguments', async () => {
    fs.writeFileSync(configPath, JSON.stringify({ mcpServers: { madeup: { command: 'node', args: [serverPath, '--api-key', KEY] } } }), 'utf8');
    const records = [];
    const stop = onLogRecord((record) => records.push(record));
    try {
      await initializeMcpTools();
      expect(await executeTool('test-agent', 'mcp__madeup__echo', { msg: USER_TEXT })).toBe('ok');
      await new Promise((resolve) => setTimeout(resolve, 200));
    } finally {
      stop();
    }
    const text = JSON.stringify(records);
    expect(records.some((r) => /Connecting to MCP server: madeup/.test(JSON.stringify(r)))).toBe(true);
    expect(text).toContain('"argCount":3');
    for (const secret of [KEY, STDERR_TOKEN, USER_TEXT, serverPath]) expect(text).not.toContain(secret);
  });
});
