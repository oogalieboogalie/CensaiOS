// A stand-in MCP tool over stdio for tests: one tool, settings, that says
// which shared setting it was started with (names only).
import readline from 'node:readline';
const send = (m) => process.stdout.write(`${JSON.stringify(m)}\n`);
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const msg = JSON.parse(line);
  if (msg.method === 'initialize') send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'settings', version: '1' } } });
  else if (msg.method === 'tools/list') send({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'settings', inputSchema: { type: 'object', properties: {} } }] } });
  else if (msg.method === 'tools/call') {
    const seen = ['MADE_UP_PASSED', 'MY_TOOL_KEY'].filter((name) => process.env[name]);
    send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: `sees: ${seen.join(', ') || 'nothing shared'}` }] } });
  }
});
