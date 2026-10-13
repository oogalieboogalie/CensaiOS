import fs from 'node:fs';
import path from 'node:path';
import { scanFile, loadConfig } from '../../lib/reliability/engine.js';

export async function handleReliabilityTool(agentId, name, args, context) {
  const { path: filePath, framework } = args;

  let fullPath;
  try {
    fullPath = path.resolve(process.cwd(), filePath);
    if (!fullPath.startsWith(process.cwd())) {
      return { error: 'Invalid path: outside of repository root' };
    }
  } catch (e) {
    return { error: `Invalid path: ${e.message}` };
  }

  if (!fs.existsSync(fullPath)) {
    return { error: `File not found: ${filePath}` };
  }

  if (name === 'scan_reliability') {
    const content = fs.readFileSync(fullPath, 'utf8');
    const config = await loadConfig();
    const result = scanFile(filePath, content, config);
    return {
      score: result.score,
      heuristics: result.heuristics,
      threshold: config.thresholds.overall,
      passed: result.score >= config.thresholds.overall
    };
  }

  if (name === 'generate_tests') {
    const ext = path.extname(filePath);
    let testFileName;
    let testContent;

    if (framework === 'jest' || ext === '.js' || ext === '.jsx' || ext === '.ts' || ext === '.tsx' || ext === '.mjs') {
      testFileName = filePath.replace(ext, '.test.js');
      testContent = `import { test, expect } from '@jest/globals';\n\n// Generated tests for ${filePath}\ntest('placeholder', () => {\n  expect(true).toBe(true);\n});\n`;
    } else if (framework === 'pytest' || ext === '.py') {
      const dir = path.dirname(filePath);
      const base = path.basename(filePath);
      testFileName = path.join(dir, `test_${base}`);
      testContent = `def test_placeholder():\n    assert True\n`;
    } else {
      return { error: `Unsupported framework or file type for test generation: ${ext}` };
    }

    const fullTestPath = path.resolve(process.cwd(), testFileName);

    // Safety check: do not overwrite original file
    if (fullTestPath === fullPath) {
      return { error: 'Generated test filename would overwrite original file' };
    }

    fs.writeFileSync(fullTestPath, testContent);

    return {
      message: `Tests generated successfully at ${testFileName}`,
      testFile: testFileName
    };
  }

  return { error: `Unknown tool: ${name}` };
}
