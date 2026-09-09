import { describe } from '@jest/globals';
import { RuleTester } from 'eslint';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function loadRule() {
  const filename = path.join(__dirname, 'ai-marker.js');
  const module = { exports: {} };
  const source = fs.readFileSync(filename, 'utf8');
  vm.runInNewContext(source, { module, exports: module.exports, require }, { filename });
  return module.exports;
}

const rule = loadRule();

const tester = new RuleTester({
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

describe('ai-marker rule', () => {
  tester.run('ai-marker', rule, {
    valid: [
      '// @ai-generated\nconst value = 1;',
      'const value = 1;',
    ],
    invalid: [
      {
        code: '// built with ai assistant\nconst value = 1;',
        errors: [{ messageId: 'missingMarker' }],
      },
    ],
  });
});
