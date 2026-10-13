import { test, expect, describe } from '@jest/globals';
import { scanFile } from '../server/lib/reliability/engine.js';
import { validateReliabilityPath } from '../server/routes/reliability.js';

describe('Reliability Engine', () => {
  const mockConfig = {
    thresholds: { overall: 80, monolith_lines: 10, nesting_depth: 2 },
    weights: { monolith: 20, complexity: 30, security: 40, tests: 10 }
  };

  test('should give 100 for a perfect small file with tests', () => {
    const content = "console.log('hello');";
    const result = scanFile('test.js', content, mockConfig);
    expect(result.score).toBe(90); // 100 - 10 (no tests)
    expect(result.heuristics.is_monolith).toBe(false);
  });

  test('should penalize monoliths', () => {
    const content = "line\n".repeat(11);
    const result = scanFile('test.js', content, mockConfig);
    expect(result.heuristics.is_monolith).toBe(true);
    expect(result.score).toBeLessThan(90);
  });

  test('should penalize deep nesting and ignore braces in strings', () => {
    const content = "{\n  {\n    {\n      const s = '{ { {';\n    }\n  }\n}";
    const result = scanFile('test.js', content, mockConfig);
    expect(result.heuristics.high_complexity).toBe(true);
  });

  test('should penalize security hotspots', () => {
    const content = "cors: { origin: '*' }";
    const result = scanFile('test.js', content, mockConfig);
    expect(result.heuristics.security_hotspots).toBe(1);
    expect(result.score).toBe(80);
  });

  test('should detect architectural drift in JSX', () => {
    const content = "localStorage.getItem('token')";
    const result = scanFile('Component.jsx', content, mockConfig);
    expect(result.heuristics.architectural_drift).toBe(true);
    expect(result.score).toBe(80); // 100 - 10 (no tests) - 10 (drift)
  });

  test('rejects absolute and traversal paths before filesystem access', () => {
    expect(() => validateReliabilityPath('../outside.js')).toThrow(/outside/i);
    expect(() => validateReliabilityPath('src/../../outside.js')).toThrow(/outside/i);
    expect(() => validateReliabilityPath('C:\\Windows\\system.ini')).toThrow(/outside/i);
  });

  test('accepts an existing file inside the repository', () => {
    expect(validateReliabilityPath('server/lib/reliability/engine.js')).toMatch(/engine\.js$/);
  });
});
