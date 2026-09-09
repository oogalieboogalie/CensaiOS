import { describe, expect, test } from '@jest/globals';
import { reliabilityTools } from './reliability.js';

describe('reliability tool definitions', () => {
  test('defines the reliability scan command schema', () => {
    const scanTool = reliabilityTools.find(tool => tool.function.name === 'scan_reliability');

    expect(scanTool.function.parameters.required).toEqual(['path']);
    expect(scanTool.function.parameters.properties.path.type).toBe('string');
  });

  test('defines the test-generation command schema', () => {
    const generateTool = reliabilityTools.find(tool => tool.function.name === 'generate_tests');

    expect(generateTool.function.parameters.required).toEqual(['path']);
    expect(generateTool.function.parameters.properties.framework.enum).toEqual(['jest', 'pytest']);
  });
});
