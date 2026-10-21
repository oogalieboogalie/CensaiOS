import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const lines = [];
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: () => ({
    info: (msg, meta) => lines.push({ level: 'info', msg, meta }),
    warn: (msg, meta) => lines.push({ level: 'warn', msg, meta }),
    error: (msg, meta) => lines.push({ level: 'error', msg, meta }),
    debug: () => {},
  }),
}));

const { automationRouter, setAutomationRunnerForTests } = await import('../server/routes/automation.js');

function app() {
  const a = express();
  a.use('/api/automation', automationRouter);
  return a;
}

const windows = () => 'win32';

afterEach(() => {
  lines.length = 0;
  setAutomationRunnerForTests();
});

describe('Automation buttons', () => {
  test('Run says so in plain words when Windows refuses, and logs it', async () => {
    const fail = Object.assign(new Error('Access is denied. C:\\Users\\Pat\\secret'), { code: 1 });
    setAutomationRunnerForTests({ exec: async () => { throw fail; }, platform: windows });
    const res = await request(app()).post('/api/automation/CensaiOverseer/run');
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/Windows did not start CensaiOverseer/);
    expect(res.body.error).not.toMatch(/Pat/);
    const refused = lines.find((l) => l.msg === 'task button refused by windows');
    expect(refused.meta).toEqual({ task: 'CensaiOverseer', action: 'run', code: 1 });
    expect(JSON.stringify(lines)).not.toMatch(/Pat|Users|denied/);
  });

  test('Enable and Disable report success only when Windows agreed', async () => {
    const calls = [];
    setAutomationRunnerForTests({ exec: async (cmd) => { calls.push(cmd); return { stdout: '' }; }, platform: windows });
    for (const action of ['enable', 'disable']) {
      const res = await request(app()).post(`/api/automation/OpenHubQueue/${action}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    }
    expect(calls[0]).toMatch(/Enable-ScheduledTask -TaskName 'OpenHubQueue'/);
    expect(calls[1]).toMatch(/Disable-ScheduledTask -TaskName 'OpenHubQueue'/);
    expect(lines.filter((l) => l.msg === 'task button worked')).toHaveLength(2);
  });

  test('unknown tasks, unknown actions and non-Windows computers are refused before PowerShell', async () => {
    const exec = jest.fn();
    setAutomationRunnerForTests({ exec, platform: () => 'linux' });
    expect((await request(app()).post('/api/automation/Nope/run')).status).toBe(400);
    expect((await request(app()).post('/api/automation/CensaiOverseer/delete')).status).toBe(404);
    const res = await request(app()).post('/api/automation/CensaiOverseer/run');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/only supported on Windows/);
    expect(exec).not.toHaveBeenCalled();
  });
});
