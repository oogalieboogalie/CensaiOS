import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDynamicTools } from '../server/tools/dynamicRegistry.js';
import { TOOL_DEFINITIONS } from '../server/tools/definitions.js';
import { TOOL_REGISTRY } from '../server/tools/handlers/index.js';
import { executeTool } from '../server/tools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dynamicDir = path.join(__dirname, '../server/tools/dynamic');

describe('Dynamic Tool Registry', () => {
  const testFileName = '__jest_test_tool.js';
  const testFilePath = path.join(dynamicDir, testFileName);
  let originalDefinitionsLength;
  let originalRegistryKeys;

  beforeAll(() => {
    // Ensure the dynamic directory exists
    if (!fs.existsSync(dynamicDir)) {
      fs.mkdirSync(dynamicDir, { recursive: true });
    }
    originalDefinitionsLength = TOOL_DEFINITIONS.length;
    originalRegistryKeys = new Set(Object.keys(TOOL_REGISTRY));
  });

  afterEach(() => {
    // Clean up test file if it exists
    if (fs.existsSync(testFilePath)) {
      try {
        fs.unlinkSync(testFilePath);
      } catch (err) {}
    }
    
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

  test('successfully scans, imports, and executes a dynamic tool', async () => {
    // 1. Create a dummy dynamic tool file
    const toolCode = `
      export const definition = {
        name: 'jest_test_tool',
        description: 'A tool for testing dynamic registry',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string' }
          },
          required: ['input']
        }
      };
      export async function handler(agentId, name, args) {
        return 'Dynamic result: ' + args.input;
      }
    `;
    fs.writeFileSync(testFilePath, toolCode, 'utf8');

    // 2. Initialize dynamic tools
    await initializeDynamicTools();

    // 3. Assert it is loaded into TOOL_DEFINITIONS and TOOL_REGISTRY
    const toolDef = TOOL_DEFINITIONS.find(t => t.function?.name === 'jest_test_tool');
    expect(toolDef).toBeDefined();
    expect(toolDef.function.description).toBe('A tool for testing dynamic registry');
    expect(TOOL_REGISTRY['jest_test_tool']).toBeDefined();

    // 4. Test execution via the orchestrator
    const result = await executeTool('test-agent', 'jest_test_tool', { input: 'hello-world' });
    expect(result).toBe('Dynamic result: hello-world');
  });

  test('ignores files with invalid structure', async () => {
    // Create an invalid file
    const invalidCode = `
      export const definition = { name: 'invalid_tool' };
      // missing handler export
    `;
    fs.writeFileSync(testFilePath, invalidCode, 'utf8');

    await initializeDynamicTools();

    const toolDef = TOOL_DEFINITIONS.find(t => t.function?.name === 'invalid_tool');
    expect(toolDef).toBeUndefined();
    expect(TOOL_REGISTRY['invalid_tool']).toBeUndefined();
  });
});
