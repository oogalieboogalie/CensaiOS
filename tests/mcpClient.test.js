import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeMcpTools, shutdownMcpTools, activeServers } from '../server/tools/mcpClient.js';
import { TOOL_DEFINITIONS } from '../server/tools/definitions.js';
import { TOOL_REGISTRY } from '../server/tools/handlers/index.js';
import { executeTool } from '../server/tools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, '../config/mcp_servers.json');
const mockServerPath = path.join(__dirname, 'mockMcpServer.js');

describe('MCP Client Integration', () => {
  let originalConfigExists = false;
  let originalConfigContent = '';
  let originalDefinitionsLength;
  let originalRegistryKeys;

  beforeAll(() => {
    originalDefinitionsLength = TOOL_DEFINITIONS.length;
    originalRegistryKeys = new Set(Object.keys(TOOL_REGISTRY));

    // Backup existing config
    if (fs.existsSync(configPath)) {
      originalConfigExists = true;
      originalConfigContent = fs.readFileSync(configPath, 'utf8');
    }

    // Write a mock MCP server script
    const mockServerCode = `
      import readline from 'readline';

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
      });

      rl.on('line', (line) => {
        try {
          const message = JSON.parse(line);
          if (message.method === 'initialize') {
            console.log(JSON.stringify({
              jsonrpc: '2.0',
              id: message.id,
              result: {
                protocolVersion: '2024-11-05',
                serverInfo: { name: 'MockServer', version: '1.0.0' }
              }
            }));
          } else if (message.method === 'tools/list') {
            console.log(JSON.stringify({
              jsonrpc: '2.0',
              id: message.id,
              result: {
                tools: [
                  {
                    name: 'mock_echo',
                    description: 'Echo back input',
                    inputSchema: {
                      type: 'object',
                      properties: {
                        msg: { type: 'string' }
                      },
                      required: ['msg']
                    }
                  }
                ]
              }
            }));
          } else if (message.method === 'tools/call') {
            console.log(JSON.stringify({
              jsonrpc: '2.0',
              id: message.id,
              result: {
                content: [
                  { type: 'text', text: 'Server response: ' + message.params.arguments.msg }
                ],
                isError: false
              }
            }));
          }
        } catch (err) {}
      });
    `;
    fs.writeFileSync(mockServerPath, mockServerCode, 'utf8');
  });

  afterAll(() => {
    // Shutdown active servers
    shutdownMcpTools();

    // Clean up mock server
    if (fs.existsSync(mockServerPath)) {
      try {
        fs.unlinkSync(mockServerPath);
      } catch (err) {}
    }

    // Restore original config
    if (originalConfigExists) {
      fs.writeFileSync(configPath, originalConfigContent, 'utf8');
    } else if (fs.existsSync(configPath)) {
      try {
        fs.unlinkSync(configPath);
      } catch (err) {}
    }
  });

  afterEach(() => {
    shutdownMcpTools();

    // Restore definitions
    while (TOOL_DEFINITIONS.length > originalDefinitionsLength) {
      TOOL_DEFINITIONS.pop();
    }

    // Restore registry
    for (const key of Object.keys(TOOL_REGISTRY)) {
      if (!originalRegistryKeys.has(key)) {
        delete TOOL_REGISTRY[key];
      }
    }
  });

  test('spawns mock MCP server, registers tools, and executes successfully', async () => {
    // 1. Create temporary mcp_servers.json configuration pointing to our mock server
    const testConfig = {
      mcpServers: {
        mock_server: {
          command: 'node',
          args: [mockServerPath]
        }
      }
    };
    fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2), 'utf8');

    // 2. Initialize MCP tools
    await initializeMcpTools();

    // 3. Assert connection is active
    expect(activeServers.has('mock_server')).toBe(true);

    // 4. Assert tool is loaded into definitions and registry with namespace
    const toolDef = TOOL_DEFINITIONS.find(t => t.function?.name === 'mcp__mock_server__mock_echo');
    expect(toolDef).toBeDefined();
    expect(toolDef.function.description).toBe('Echo back input');
    expect(TOOL_REGISTRY['mcp__mock_server__mock_echo']).toBeDefined();

    // 5. Execute tool and verify the output
    const result = await executeTool('test-agent', 'mcp__mock_server__mock_echo', { msg: 'hello mcp' });
    expect(result).toBe('Server response: hello mcp');
  });
});
