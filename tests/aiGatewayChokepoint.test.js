import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ROOT = path.join(REPO_ROOT, 'server');
const ALLOWED_CHAT_COMPLETION_FILES = new Set([
  'server/aiGateway/chatCompletion.js',
]);
const ALLOWED_GOOGLE_GENAI_FILES = new Set([
  'server/aiGateway/geminiNativeChat.js',
  'server/aiGateway/imageGeneration.js',
]);
const EMBEDDING_ENDPOINTS = ['/embeddings', '/v2/embed'];

function listServerSourceFiles(dir = SERVER_ROOT) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listServerSourceFiles(fullPath));
    } else if (/\.(js|mjs|cjs)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function repoPath(file) {
  return path.relative(REPO_ROOT, file).replaceAll(path.sep, '/');
}

describe('AI Gateway chokepoint', () => {
  test('production chat-completion HTTP calls stay behind the gateway', () => {
    const offenders = listServerSourceFiles()
      .map(file => [repoPath(file), fs.readFileSync(file, 'utf8')])
      .filter(([rel]) => !ALLOWED_CHAT_COMPLETION_FILES.has(rel))
      .filter(([, src]) => src.includes('/chat/completions'))
      .map(([rel]) => rel);

    expect(offenders).toEqual([]);
  });

  test('production embedding HTTP calls stay behind the gateway', () => {
    const offenders = listServerSourceFiles()
      .map(file => [repoPath(file), fs.readFileSync(file, 'utf8')])
      .filter(([rel]) => !rel.startsWith('server/aiGateway/'))
      .filter(([, src]) => src.includes('fetch(') && EMBEDDING_ENDPOINTS.some(endpoint => src.includes(endpoint)))
      .map(([rel]) => rel);

    expect(offenders).toEqual([]);
  });

  test('production Google GenAI SDK calls stay behind the gateway', () => {
    const offenders = listServerSourceFiles()
      .map(file => [repoPath(file), fs.readFileSync(file, 'utf8')])
      .filter(([rel]) => !ALLOWED_GOOGLE_GENAI_FILES.has(rel))
      .filter(([, src]) => src.includes('@google/genai') || src.includes('GoogleGenAI'))
      .map(([rel]) => rel);

    expect(offenders).toEqual([]);
  });
});
