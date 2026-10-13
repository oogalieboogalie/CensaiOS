// A tiny MCP server over stdio for tests: one tool, echo. Exits with code 3
// when the key it expects in ECHO_KEY is missing.
import readline from 'node:readline';
if (process.env.ECHO_KEY !== 'k-123') { console.error('Error: missing ECHO_KEY'); process.exit(3); }
const send = (m) => process.stdout.write(`${JSON.stringify(m)}\n`);
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const msg = JSON.parse(line);
  if (msg.method === 'initialize') send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'echo', version: '1' } } });
  else if (msg.method === 'tools/list') send({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'echo', description: 'Say it back', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }] } });
  else if (msg.method === 'tools/call') {
    // Ask the client something first, the way real servers sometimes do.
    send({ jsonrpc: '2.0', id: 'srv-1', method: 'ping' });
    send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: `echo: ${msg.params.arguments.text}` }] } });
  }
});
