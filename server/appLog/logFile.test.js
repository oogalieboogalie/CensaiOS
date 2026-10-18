import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

// The real file write is skipped under NODE_ENV=test, so run a small server
// process the way the app does and look at what landed on disk.
test('logger lines and plain console lines land in one scrubbed file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'applog-file-'));
  const at = (file) => JSON.stringify(path.resolve('server', file));
  const script = `
    const { createLogger } = await import(${at('logger.js')});
    const { installConsoleCapture } = await import(${at('appLog/consoleCapture.js')});
    installConsoleCapture();
    createLogger('chat').warn('provider said no', { apiKey: 'abc', note: 'token=supersecretvalue1 for alex@example.com' });
    console.log('plain line with sk-ant-abcdefghijklmnop');
    await new Promise((r) => setTimeout(r, 200));
  `;
  execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: path.resolve('.'),
    env: { ...process.env, NODE_ENV: 'development', LOG_DIR: dir, LOG_LEVEL: 'info' },
    stdio: 'pipe',
  });
  const [file] = fs.readdirSync(dir);
  const records = fs.readFileSync(path.join(dir, file), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  expect(records).toHaveLength(2);
  expect(records[0]).toMatchObject({ level: 'warn', namespace: 'chat', message: 'provider said no' });
  expect(records[1]).toMatchObject({ level: 'info', namespace: 'console' });
  const text = JSON.stringify(records);
  expect(text).not.toMatch(/supersecretvalue1|alex@example\.com|sk-ant-|"abc"/);
});
